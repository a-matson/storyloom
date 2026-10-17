import { jsonrepair } from 'jsonrepair';
import type { Adventure } from '../model/types';
import { z } from 'zod/mini';
import {
  IntroducedEntity,
  MAX_INTRODUCED,
  sceneRead,
  STAYS,
  stateChange,
  ZONE_CHARS,
  turnRead,
  type SceneRead,
  type StateAsk,
  type StateChange,
  type Verdict,
} from '../schema/extraction';
import type { StateRecord } from '../text/statePrompt';
import { actionStoryText } from '../text/formatting';
import { parseJsonReply } from '../text/jsonReply';
import { EXTRACT_SYSTEM } from '../text/prompts';
import { introducePrompt, type PrevScene } from '../text/turnReadPrompt';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { helperCall } from './helperCall';
import { grammarOf } from './extractJsonSchema';
import type { MemoryRange } from './memoryBank';
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
export function lists(data: unknown, cut: boolean) {
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

export interface TurnRead {
  /** Absent when the reply's scene did not parse. */
  scene?: SceneRead;
  entities: z.output<typeof IntroducedEntity>[];
  /** Read B's entries, when it was asked. */
  changes?: StateChange[];
}
const turnAccepter =
  (cast: readonly string[], before: readonly string[], state?: StateAsk) =>
  (cut: boolean) =>
  (data: unknown): TurnRead | null => {
    const l = lists(data, cut);
    if (!l) return null;
    // Without the grammar a name outside the cast costs only itself, and a bad scene only the scene.
    const raw = Envelope.safeParse(l.data['scene']).data;
    const known = (key: string) => (List.safeParse(raw?.[key]).data ?? []).filter((x) => typeof x === 'string' && cast.includes(x));
    // A missing or bad verdict is "here"; a `left` list (the read before M14-S2) still counts.
    const said = Envelope.safeParse(raw?.['stay']).data;
    const gone = known('left');
    const verdict = (n: string): Verdict => {
      const room = Envelope.safeParse(said?.[n]).data?.['room'];
      if (typeof room === 'string') return { room: room.slice(0, ZONE_CHARS) };
      return STAYS.find((s) => s === said?.[n]) ?? (gone.includes(n) ? 'left' : 'here');
    };
    const stay = Object.fromEntries(before.map((n) => [n, verdict(n)]));
    const scene = raw && sceneRead(cast, before).safeParse({ ...raw, present: known('present'), stay }).data;
    return {
      ...(scene && { scene }),
      entities: l.items('entities', IntroducedEntity, MAX_INTRODUCED),
      ...(state && { changes: l.items('changes', stateChange(state.who), state.max) }),
    };
  };

/** Without them a JSON read looped a key to its token cap (state probes P1, P8). JSON reads only: memory-keep is measured on the prose calls' samplers. [provisional] */
export const HELPER_JSON_SAMPLING = { repeatLastN: 256, presencePenalty: 0.3 };

/**
 * One helper call on slot 1 for a JSON reply: the grammar when the backend has one, else a `{` prefill. Null when unusable; a call typing cut throws.
 * `gbnf`, the same shape with no whitespace, replaces `jsonSchema` on a backend that takes both.
 */
export async function helperJson<R>(
  prompt: (grammar: boolean) => string,
  jsonSchema: Record<string, unknown>,
  maxTokens: number,
  accept: (cut: boolean) => (data: unknown) => R | null,
  deps: ExtractDeps,
  job: 'entity' | 'state' = 'entity',
  gbnf?: string,
): Promise<R | null> {
  const caps = await deps.provider.capabilities();
  const grammar = caps.jsonSchema && caps.grammar ? gbnf : undefined;
  const rendered = renderTemplate(deps.template, withContent(EXTRACT_SYSTEM, deps.content), prompt(caps.jsonSchema), caps.jsonSchema ? '' : '{');
  const { text, stats } = await helperCall(
    job,
    maxTokens,
    rendered.prompt,
    (signal) =>
      deps.provider.complete(
        {
          prompt: rendered.prompt,
          maxTokens,
          temperature: 0.2,
          topP: 0.9,
          ...HELPER_JSON_SAMPLING,
          stop: rendered.stop,
          // Slot 1's KV is its own: a cached helper leaves the story's slot-0 prefix whole. [measured: M17-2 /slots check, DECISIONS]
          cachePrompt: true,
          slotId: 1,
          jsonSchema: caps.jsonSchema && !grammar ? jsonSchema : undefined,
          grammar,
        },
        signal,
      ),
    deps,
  );
  return parseJsonReply(caps.jsonSchema ? text : `{${text}`, accept(stats?.stopReason === 'length'), jsonrepair);
}

/** The scene, then three entities of a description and a look each, with the JSON around them. [provisional] */
const INTRODUCE_TOKENS = 200;
/** The scene alone: a place, a few names, the weather. [provisional] */
const SCENE_TOKENS = 80;
/**
 * Per entry read B may give in the merged read: the 12B pretty-prints them (~25 tokens each), and with `changes` first a
 * cut loses the scene. With five present, read B's own 40 × subjects capped at 160 cut 2 of 31 replies, 30 per entry 1
 * (seven entries, then a scene of five). [measured: 2026-10-16-state-m17-1-ab6.json, -ab7.json]
 */
const CHANGE_TOKENS = 40;
/** Per character present before: a room is `{"room": "basement storeroom"}`, ~10 tokens over "left". [provisional] */
const STAY_TOKENS = 8;

/** The turn read's reply budget: the scene's with a verdict per one `present` before, the cards' beyond it, and read B's when merged in. */
export const turnReadTokens = (newNames: readonly string[], state?: StateAsk, present = 0) =>
  SCENE_TOKENS + STAY_TOKENS * present + (newNames.length ? INTRODUCE_TOKENS - SCENE_TOKENS : 0) + (state ? CHANGE_TOKENS * state.max : 0);

/**
 * The turn read: where the passage ends, after `prev`, with `cast` (every known character name and alias)
 * as the names it may give; and kind, description and looks for each new name; with `state`, read B's changes too.
 */
export function readTurn(
  passage: string,
  newNames: readonly string[],
  prev: PrevScene,
  cast: readonly string[],
  deps: ExtractDeps,
  state?: StateAsk & { records: readonly StateRecord[] },
): Promise<TurnRead | null> {
  // Factions go in the enum but not `prev.present`: a group gets no `stay` (M21-4).
  const listable = [...new Set([...cast, ...(prev.factions ?? [])])];
  return helperJson(
    (g) => introducePrompt(passage, newNames, g, prev, cast, state),
    grammarOf(turnRead(listable, newNames, prev.present, state)),
    turnReadTokens(newNames, state, prev.present.length),
    turnAccepter(listable, prev.present, state),
    deps,
  );
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
