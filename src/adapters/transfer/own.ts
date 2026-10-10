import { z } from 'zod/mini';
import type { Action, Adventure, TurnTrace } from '@core/model';
import { newId } from '@core/model';
import * as S from '@core/schema';

export const FORMAT = 'storyloom-adventure';

type Image = NonNullable<Action['image']>;

const AdventureExport = z.object({ format: z.literal(FORMAT), version: z.literal(1), exportedAt: z.optional(z.string()), adventure: S.Adventure });

export function exportAdventureJson(a: Adventure): string {
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), adventure: a }, null, 2);
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
  const bare = S.Adventure.safeParse(data);
  return bare.success ? renumber(bare.data) : undefined;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function firstIssue(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  const i = error.issues[0];
  return i ? `${i.path.join('.') || '(root)'}: ${i.message}` : 'invalid';
}

/** An image blob does not travel with the JSON, so its id is dropped and the See action says so. */
function withoutBlob({ imageId, ...image }: Image): Image {
  return { ...image, ...(imageId === undefined ? {} : { missing: true as const }) };
}

/** Fresh ids so an import never overwrites an existing adventure, and no ids pointing at blobs we do not have. */
function renumber(a: Adventure): Adventure {
  const { coverId: _cover, ...rest } = a;
  const ids = new Map([...a.storyCards.map((c) => [c.id, newId('card_')] as const), ...a.entities.map((e) => [e.id, newId('ent_')] as const)]);
  const id = (old: string) => ids.get(old) ?? old;
  return {
    ...rest,
    id: newId('adv_'),
    actions: a.actions.map(({ image, ...x }) => ({
      ...x,
      id: newId('act_'),
      ...(image && { image: { ...withoutBlob(image), ...(image.entityIds && { entityIds: image.entityIds.map(id) }) } }),
    })),
    storyCards: a.storyCards.map((c) => ({ ...c, id: id(c.id) })),
    // Without the id the portrait is drawn again between turns.
    entities: a.entities.map(({ portraitId: _portrait, ...e }) => ({
      ...e,
      id: id(e.id),
      relations: e.relations.map((r) => ({ ...r, to: id(r.to) })),
      ...(e.cardId && { cardId: id(e.cardId) }),
    })),
    memories: [], // embeddings may come from another embedder; rebuilt lazily
    updatedAt: Date.now(),
  };
}
