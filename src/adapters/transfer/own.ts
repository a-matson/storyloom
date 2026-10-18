import { z } from 'zod/mini';
import type { Action, Adventure, TurnTrace } from '@core/model';
import { newId } from '@core/model';
import * as S from '@core/schema';

export const FORMAT = 'storyloom-adventure';

type Image = NonNullable<Action['image']>;
type Exported = z.output<typeof S.LegacyAdventure>;

/** Version 1 predates the assertion store: its entity facts move on the first open (`migrateEntities`). */
const AdventureExport = z.object({ format: z.literal(FORMAT), version: z.literal([1, 2]), exportedAt: z.optional(z.string()), adventure: S.LegacyAdventure });

export function exportAdventureJson(a: Adventure): string {
  return JSON.stringify({ format: FORMAT, version: 2, exportedAt: new Date().toISOString(), adventure: a }, null, 2);
}

/** Plain-text transcript (what a reader would want). */
export function exportAdventureText(a: Adventure): string {
  return a.actions
    .filter((x) => x.type !== 'see')
    .map((x) => x.versions[x.active] ?? '')
    .join('\n\n');
}

/** One trace per line, oldest first, prompt text included (local-only debugging record). */
export function exportTracesJsonl(traces: readonly TurnTrace[]): string {
  return (
    traces
      .toSorted((a, b) => a.createdAt - b.createdAt)
      .map((t) => JSON.stringify(t))
      .join('\n') + (traces.length ? '\n' : '')
  );
}

/** Our export or a bare adventure; undefined when the data is neither. Throws with the field path when it is ours but damaged. */
export function parseOwn(data: unknown): Adventure | undefined {
  const wrapped = AdventureExport.safeParse(data);
  if (wrapped.success) return renumber(wrapped.data.adventure);
  if (isRecord(data) && data['format'] === FORMAT) throw new Error(`Damaged Storyloom export: ${firstIssue(wrapped.error)}`);
  const bare = S.LegacyAdventure.safeParse(data);
  return bare.success ? renumber(bare.data) : undefined;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function firstIssue(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  const i = error.issues[0];
  return i ? `${i.path.join('.') || '(root)'}: ${i.message}` : 'invalid';
}

/** An image blob does not travel with the JSON, so its id is dropped and the See action says so. Unpicked renders stay home. */
function withoutBlob({ imageId, candidates: _unpicked, ...image }: Image): Image {
  return { ...image, ...(imageId === undefined ? {} : { missing: true as const }) };
}

/** Fresh ids so an import never overwrites an existing adventure, and no ids pointing at blobs we do not have. */
function renumber(a: Exported): Adventure {
  const { coverId: _cover, ...rest } = a;
  const ids = new Map([...a.storyCards.map((c) => [c.id, newId('card_')] as const), ...a.entities.map((e) => [e.id, newId('ent_')] as const)]);
  const id = (old: string) => ids.get(old) ?? old;
  const actionIds = new Map(a.actions.map((x) => [x.id, newId('act_')]));
  const { scene, sceneLog, presence } = a.plot;
  return {
    ...rest,
    id: newId('adv_'),
    // The scene and its logs hold entity ids (or names, which `id` passes through).
    plot: {
      ...a.plot,
      ...(scene && {
        scene: {
          ...scene,
          present: scene.present.map(id),
          ...(scene.location !== undefined && { location: id(scene.location) }),
          ...(scene.zones && { zones: Object.fromEntries(Object.entries(scene.zones).map(([k, v]) => [id(k), v])) }),
          ...(scene.groups && { groups: scene.groups.map((g) => Object.assign({}, g, { id: id(g.id) })) }),
        },
      }),
      ...(sceneLog && { sceneLog: sceneLog.map((s) => ({ at: s.at, location: id(s.location) })) }),
      ...(presence && { presence: presence.map((p) => ({ at: p.at, present: p.present.map(id) })) }),
    },
    actions: a.actions.map(({ image, ...x }) => ({
      ...x,
      id: actionIds.get(x.id) ?? newId('act_'),
      ...(image && { image: { ...withoutBlob(image), ...(image.entityIds && { entityIds: image.entityIds.map(id) }) } }),
    })),
    storyCards: a.storyCards.map((c) => ({ ...c, id: id(c.id) })),
    // Without the id the portrait is drawn again between turns.
    entities: a.entities.map(({ portraitId: _portrait, portraitBasis: _basis, referenceImageId: _reference, sheetImageId: _sheet, ...e }) => ({
      ...e,
      id: id(e.id),
      relations: e.relations.map((r) => ({ ...r, to: id(r.to) })),
      ...(e.cardId && { cardId: id(e.cardId) }),
      // A version 1 export's facts, moved on the first open: their sources and causes follow the new ids.
      ...(e.facts && {
        facts: e.facts.map(({ sourceId, cause, ...f }) => ({
          ...f,
          ...(sourceId !== undefined && { sourceId: actionIds.get(sourceId) ?? sourceId }),
          ...(cause && { cause: cause.id ? { ...cause, id: id(cause.id) } : cause }),
        })),
      }),
    })),
    // Rule ids are local to the adventure record, so only their gates follow the entities.
    rules: a.rules.map((r) => ({ ...r, gates: r.gates.map(id) })),
    assertions: a.assertions.map((x) => ({
      ...x,
      subject: id(x.subject),
      ...(x.kind === 'effect' && x.cause?.id && { cause: { ...x.cause, id: id(x.cause.id) } }),
      ...(x.kind === 'secret' && { knownBy: x.knownBy.map(id) }),
      ...(x.kind === 'event' && { who: x.who.map(id) }),
    })),
    memories: [], // embeddings may come from another embedder; rebuilt lazily
    updatedAt: Date.now(),
  };
}
