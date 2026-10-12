import { jsonrepair } from 'jsonrepair';
import type { Adventure, ExtractionJson, Speaker } from '../model/types';
import { z } from 'zod/mini';
import { ExtractedEntity, IntroducedEntity, MAX_ENTITIES, MAX_INTRODUCED, ExtractionJson as Schema, SpokenIn, TurnScene } from '../schema/extraction';
import { actionStoryText } from '../text/formatting';
import { parseJsonReply } from '../text/jsonReply';
import { EXTRACT_SYSTEM, extractPrompt, introducePrompt } from '../text/prompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { helperCall } from './helperCall';
import { attributeSpeakers } from './entities';
import { EXTRACT_JSON_SCHEMA, INTRODUCE_JSON_SCHEMA, SCENE_JSON_SCHEMA } from './extractJsonSchema';
import { foldEntities, type FoldLog } from './fold';
import { entitiesOverdue, type MemoryRange } from './memoryBank';
import type { MaintenanceDeps } from './memoryJobs';

/** The call needs no embedder, so the player's "Update from story" works without one. */
export type ExtractDeps = Pick<MaintenanceDeps, 'provider' | 'template' | 'cancel' | 'cuts' | 'content'>;

const Envelope = z.looseObject({});
const List = z.array(z.unknown());

/**
 * The reply's lists, each item checked alone, so a bad one (a lowercase name without the grammar)
 * costs only itself; without the grammar a list may run past `max`, and the first ones are kept.
 * Repair closes a reply cut at maxTokens mid-item, so the last list it holds loses its last item.
 */
function lists(data: unknown, cut: boolean) {
  const loose = Envelope.safeParse(data);
  if (!loose.success) return null;
  const d = loose.data;
  const cutIn = cut ? Object.keys(d).findLast((k) => List.safeParse(d[k]).success) : undefined;
  return {
    data: d,
    items: <T>(key: string, item: z.ZodMiniType<T>, max: number): T[] => {
      const all = List.safeParse(d[key]).data ?? [];
      return (key === cutIn ? all.slice(0, -1) : all).slice(0, max).flatMap((x) => {
        const one = item.safeParse(x);
        return one.success ? [one.data] : [];
      });
    },
  };
}

const extractAccepter =
  (cut: boolean) =>
  (data: unknown): ExtractionJson | null => {
    const l = lists(data, cut);
    if (!l) return null;
    const r = Schema.safeParse({
      ...l.data,
      entities: l.items('entities', ExtractedEntity, MAX_ENTITIES),
      speakers: l.items('speakers', SpokenIn, Infinity),
    });
    return r.success ? r.data : null;
  };
export interface TurnRead {
  scene: z.output<typeof TurnScene>;
  entities: z.output<typeof IntroducedEntity>[];
}
const turnAccepter =
  (cut: boolean) =>
  (data: unknown): TurnRead | null => {
    const l = lists(data, cut);
    // A bad scene costs only the scene.
    return l && { scene: TurnScene.safeParse(l.data['scene']).data ?? {}, entities: l.items('entities', IntroducedEntity, MAX_INTRODUCED) };
  };

/** One helper call on slot 1 for a JSON reply: the grammar when the backend has one, else a `{` prefill. Null when unusable; a call typing cut throws. */
async function helperJson<R>(
  prompt: (grammar: boolean) => string,
  jsonSchema: Record<string, unknown>,
  maxTokens: number,
  accept: (cut: boolean) => (data: unknown) => R | null,
  deps: ExtractDeps,
): Promise<R | null> {
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(deps.template, withContent(EXTRACT_SYSTEM, deps.content), prompt(caps.jsonSchema), caps.jsonSchema ? '' : '{');
  const { text, stats } = await helperCall(
    'entity',
    maxTokens,
    (signal) =>
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
        signal,
      ),
    deps,
  );
  return parseJsonReply(caps.jsonSchema ? text : `{${text}`, accept(stats?.stopReason === 'length'), jsonrepair);
}

/** Keyed looks and state cost more than 300 tokens with five entities. [provisional] */
const EXTRACT_TOKENS = 500;

/**
 * The combined helper call: entities and speakers for one passage whose paragraphs are
 * numbered by action index. Null when the reply is unusable.
 */
export function extractFromPassage(passage: string, knownNames: readonly string[], deps: ExtractDeps): Promise<ExtractionJson | null> {
  return helperJson((g) => extractPrompt(passage, knownNames, g), EXTRACT_JSON_SCHEMA, EXTRACT_TOKENS, extractAccepter, deps);
}

/** The scene, then three entities of a description and a look each, with the JSON around them. [provisional] */
const INTRODUCE_TOKENS = 200;
/** The scene alone: a place, a few names, the weather. [provisional] */
const SCENE_TOKENS = 80;

/** The turn read: where the passage ends, and kind, description and looks for each new name. */
export function readTurn(passage: string, newNames: readonly string[], deps: ExtractDeps): Promise<TurnRead | null> {
  const cards = newNames.length > 0;
  return helperJson(
    (g) => introducePrompt(passage, newNames, g),
    cards ? INTRODUCE_JSON_SCHEMA : SCENE_JSON_SCHEMA,
    cards ? INTRODUCE_TOKENS : SCENE_TOKENS,
    turnAccepter,
    deps,
  );
}

/**
 * Memories read by one call: each call costs ~26 s on slot 1, so two ranges share it. Fewer due
 * memories wait, so a session's last memory is extracted in the next one.
 * [measured: 2026-10-08-recall-wave2-run1.json]
 */
const ENTITY_BATCH = 2;

/**
 * One combined call over the oldest `ENTITY_BATCH` memories not yet extracted, as one passage.
 * `scriptState.__entitiesAt` advances past them once the call ends, unusable reply included,
 * but not when the call was cut: a cut call is retried on the next idle run.
 */
export async function catchUpEntities(adventure: Adventure, deps: MaintenanceDeps): Promise<EntityUpdate> {
  const none = { touched: 0, speakers: new Map<string, Speaker[]>() };
  const done = adventure.scriptState.__entitiesAt ?? 0;
  const due = adventure.memories.filter((m) => !m.stale && m.toAction > done).toSorted((a, b) => a.fromAction - b.fromAction);
  const first = due[0];
  const last = due[ENTITY_BATCH - 1];
  if (!first || !last || (deps.signal?.aborted && !entitiesOverdue(adventure))) return none;
  const r = await updateEntities(adventure, { fromAction: first.fromAction, toAction: last.toAction }, deps);
  adventure.scriptState = { ...adventure.scriptState, __entitiesAt: last.toAction };
  return { touched: r.touched, speakers: r.speakers, ...(r.log && { log: r.log }) };
}

export interface EntityUpdate {
  /** Entities created or changed. */
  touched: number;
  /** Speaker labels by action id, for `ActionLog.annotate`: actions live in the log, not on `adventure`. */
  speakers: Map<string, Speaker[]>;
  /** The helper's reply, when there was a usable one. */
  reply?: ExtractionJson;
  /** What the fold proposed and dropped, for a batch call that had a reply. */
  log?: FoldLog;
}

/** The range's actions, numbered by index, as the helper reads them. */
export function passageOf(adventure: Adventure, range: MemoryRange): string {
  return adventure.actions
    .slice(range.fromAction, range.toAction)
    .map((a, i) => [range.fromAction + i, actionStoryText(a)] as const)
    .filter(([, t]) => t !== '')
    .map(([n, t]) => `[${n}] ${t}`)
    .join('\n');
}

/** Extract from the range's actions and fold the result into `adventure.entities`. */
export async function updateEntities(adventure: Adventure, range: MemoryRange, deps: ExtractDeps): Promise<EntityUpdate> {
  const passage = passageOf(adventure, range);
  const known = adventure.entities.map((e) => e.name);
  const reply = passage ? await extractFromPassage(passage, known, deps) : null;
  if (!reply) return { touched: 0, speakers: new Map() };
  const log: FoldLog = { proposed: 0, rejected: [] };
  const touched = foldEntities(adventure, reply.entities, passage, range, { twice: true, log }); // Calls are sequential: the last one logged is this one.
  const call = deps.cuts?.calls?.at(-1);
  if (call?.job === 'entity') call.factsProposed = log.proposed;
  return { touched, speakers: attributeSpeakers(adventure.actions, reply.speakers, adventure.entities), reply, log };
}
