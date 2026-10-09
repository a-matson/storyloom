import { jsonrepair } from 'jsonrepair';
import type { Adventure, ExtractionJson, Speaker } from '../model/types';
import { collect } from '../ports/provider';
import { z } from 'zod/mini';
import { ExtractedEntity, IntroducedEntity, MAX_ENTITIES, MAX_INTRODUCED, ExtractionJson as Schema } from '../schema/extraction';
import { actionStoryText } from '../text/formatting';
import { parseJsonReply } from '../text/jsonReply';
import { EXTRACT_SYSTEM, extractPrompt, introducePrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { attributeSpeakers, matchEntity, mergeEntity, namedInPassage } from './entities';
import { EXTRACT_JSON_SCHEMA, INTRODUCE_JSON_SCHEMA } from './extractJsonSchema';
import { entitiesOverdue, type MemoryRange } from './memoryBank';
import { nextScene } from './scene';
import type { MaintenanceDeps } from './memoryJobs';

/** The call needs no embedder, so the player's "Update from story" works without one. */
export type ExtractDeps = Pick<MaintenanceDeps, 'provider' | 'template' | 'cancel'>;

// Entities are checked one by one, so a bad one (a lowercase name without the grammar) costs only itself.
const Envelope = z.looseObject({ entities: z.array(z.unknown()) });

/**
 * A reply cut at maxTokens loses `speakers` after repair (the entities before it are whole), and
 * repair closes its last entity mid-fact, so that one is dropped. Without the grammar a reply may
 * list more than `max` entities; the first ones are kept.
 */
const accepter =
  <T, R>(item: z.ZodMiniType<T>, max: number, whole: (data: object, entities: T[]) => R | null) =>
  (cut: boolean) =>
  (data: unknown): R | null => {
    const loose = Envelope.safeParse(data);
    if (!loose.success) return null;
    const kept = cut ? loose.data.entities.slice(0, -1) : loose.data.entities;
    const entities = kept.slice(0, max).flatMap((e) => {
      const one = item.safeParse(e);
      return one.success ? [one.data] : [];
    });
    return whole(loose.data, entities);
  };

const extractAccepter = accepter(ExtractedEntity, MAX_ENTITIES, (data, entities) => {
  const r = Schema.safeParse({ scene: {}, speakers: [], ...data, entities });
  return r.success ? r.data : null;
});
const introduceAccepter = accepter(IntroducedEntity, MAX_INTRODUCED, (_, entities) => entities);

/** One helper call on slot 1 for a JSON reply: the grammar when the backend has one, else a `{` prefill. Null when unusable or cancelled. */
async function helperJson<R>(
  prompt: (grammar: boolean) => string,
  jsonSchema: Record<string, unknown>,
  maxTokens: number,
  accept: (cut: boolean) => (data: unknown) => R | null,
  deps: ExtractDeps,
): Promise<R | null> {
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(deps.template, EXTRACT_SYSTEM, prompt(caps.jsonSchema), caps.jsonSchema ? '' : '{');
  const { text, stats } = await trackJob('entity', () =>
    collect(
      deps.provider.complete(
        {
          prompt: rendered.prompt,
          maxTokens,
          temperature: 0.2,
          topP: 0.9,
          stop: rendered.stop,
          cachePrompt: false,
          slotId: 1,
          jsonSchema: caps.jsonSchema ? jsonSchema : undefined,
        },
        deps.cancel,
      ),
    ),
  );
  if (deps.cancel?.aborted) return null;
  return parseJsonReply(caps.jsonSchema ? text : `{${text}`, accept(stats?.stopReason === 'length'), jsonrepair);
}

/**
 * The combined helper call: entities, speakers and scene for one passage
 * whose paragraphs are numbered by action index. Null when the reply is unusable or cut.
 */
export function extractFromPassage(passage: string, knownNames: string[], deps: ExtractDeps): Promise<ExtractionJson | null> {
  // 300 fits MAX_ENTITIES [measured: 2026-10-08-recall-wave2-run1.json]
  return helperJson((g) => extractPrompt(passage, knownNames, g), EXTRACT_JSON_SCHEMA, 300, extractAccepter, deps);
}

/** Three entities of a description and a look each, with the JSON around them. [provisional] */
const INTRODUCE_TOKENS = 200;

/** The introduction call: kind, description and appearance for each new name. */
export function introduceFromPassage(passage: string, newNames: readonly string[], deps: ExtractDeps): Promise<z.infer<typeof IntroducedEntity>[] | null> {
  return helperJson((g) => introducePrompt(passage, newNames, g), INTRODUCE_JSON_SCHEMA, INTRODUCE_TOKENS, introduceAccepter, deps);
}

/**
 * Memories read by one call: each call costs ~26 s on slot 1, so two ranges share it. Fewer due
 * memories wait, so a session's last memory is extracted in the next one.
 * [measured: 2026-10-08-recall-wave2-run1.json]
 */
const ENTITY_BATCH = 2;

/** The player, and a role the grammar let through by capitalising its article ("The creature"). */
export const NOT_A_NAME = /^\s*you\s*$|^(the|a|an) \p{Ll}/iu;

/**
 * One combined call over the oldest `ENTITY_BATCH` memories not yet extracted, as one passage.
 * `scriptState.__entitiesAt` advances past them once the call ends, unusable reply included,
 * but not when the call was cut: a cut call is retried on the next idle run.
 */
export async function catchUpEntities(adventure: Adventure, deps: MaintenanceDeps): Promise<EntityUpdate & { sceneUpdated: boolean }> {
  const none = { touched: 0, speakers: new Map<string, Speaker[]>(), sceneUpdated: false };
  const done = adventure.scriptState.__entitiesAt ?? 0;
  const due = adventure.memories.filter((m) => !m.stale && m.toAction > done).toSorted((a, b) => a.fromAction - b.fromAction);
  const first = due[0];
  const last = due[ENTITY_BATCH - 1];
  if (!first || !last || (deps.signal?.aborted && !entitiesOverdue(adventure))) return none;
  const r = await updateEntities(adventure, { fromAction: first.fromAction, toAction: last.toAction }, deps);
  if (deps.cancel?.aborted) return none;
  // Here, not in `updateEntities`: "Update from story" re-reads old ranges and would move the scene back to them.
  const scene = r.reply && nextScene(adventure.plot.scene, r.reply, (n) => n !== '' && !NOT_A_NAME.test(n));
  const sceneUpdated = !!scene && scene !== adventure.plot.scene;
  if (scene && sceneUpdated) adventure.plot = { ...adventure.plot, scene };
  adventure.scriptState = { ...adventure.scriptState, __entitiesAt: last.toAction };
  return { touched: r.touched, speakers: r.speakers, sceneUpdated };
}

export interface EntityUpdate {
  /** Entities created or changed. */
  touched: number;
  /** Speaker labels by action id, for `ActionLog.annotate`: actions live in the log, not on `adventure`. */
  speakers: Map<string, Speaker[]>;
  /** The helper's reply, when there was a usable one. */
  reply?: ExtractionJson;
}

/** An appearance that says there is none: the 12B fills the field anyway ("Not described in the passage"). [measured: 2026-10-09-live-play-m11-2.json] */
const NO_LOOKS = /\bnot (?:described|mentioned|stated|shown|given|specified)\b|^(?:unknown|none(?: specified| given)?|n\/a)\.?$/i;

/** The range's actions, numbered by index, as the helper reads them. */
export function passageOf(adventure: Adventure, range: MemoryRange): string {
  return adventure.actions
    .slice(range.fromAction, range.toAction)
    .map((a, i) => [range.fromAction + i, actionStoryText(a)] as const)
    .filter(([, t]) => t !== '')
    .map(([n, t]) => `[${n}] ${t}`)
    .join('\n');
}

/** Folds the helper's entities into `adventure.entities`; a new one only when the passage names it. Returns how many changed. */
export function foldEntities(adventure: Adventure, incoming: readonly z.infer<typeof ExtractedEntity>[], passage: string, at: number): number {
  let entities = adventure.entities;
  for (const { appearance, ...rest } of incoming) {
    if (NOT_A_NAME.test(rest.name)) continue;
    const old = matchEntity(entities, rest.name);
    if (!old && !namedInPassage(rest.name, passage)) continue;
    const merged = mergeEntity(old, appearance && !NO_LOOKS.test(appearance) ? { ...rest, appearance } : rest, at);
    entities = old ? entities.map((e) => (e === old ? merged : e)) : [...entities, merged];
  }
  const touched = entities.filter((e, i) => e !== adventure.entities[i]).length;
  adventure.entities = entities;
  return touched;
}

/** Extract from the range's actions and fold the result into `adventure.entities`. */
export async function updateEntities(adventure: Adventure, range: MemoryRange, deps: ExtractDeps): Promise<EntityUpdate> {
  const passage = passageOf(adventure, range);
  const reply = passage
    ? await extractFromPassage(
        passage,
        adventure.entities.map((e) => e.name),
        deps,
      )
    : null;
  if (!reply) return { touched: 0, speakers: new Map() };
  const touched = foldEntities(adventure, reply.entities, passage, range.toAction - 1);
  return { touched, speakers: attributeSpeakers(adventure.actions, reply.speakers, adventure.entities), reply };
}
