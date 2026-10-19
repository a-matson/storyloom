import type { Adventure, ExtractionJson } from '../model/types';
import { z } from 'zod/mini';
import {
  ExtractedEntity,
  MAX_ENTITIES,
  MAX_EVENTS,
  MAX_REFERS,
  ExtractionJson as Schema,
  extractionJson,
  type ExtractedEvent,
  type RefersTo,
} from '../schema/extraction';
import { extractPrompt } from '../text/prompts';
import { helperJson, lists, passageOf, type ExtractDeps } from './extract';
import { extractGrammar, grammarOf } from './extractJsonSchema';
import { foldEntities, type FoldLog } from './fold';
import { ENTITY_BATCH, entitiesOverdue, type MemoryRange } from './memoryBank';
import type { MaintenanceDeps } from './memoryJobs';
import { indexAssertions } from './assertionIndex';
import { castLabels, namesOf, words } from './names';
import { acceptRoles } from './roles';
import { fileRooms } from './rooms';
import { foldEvents } from './events';

/** `cut`: the reply ran to its cap inside `entities`; one cut in `refersTo` or `events` lost roles or events only. */
type Extracted = ExtractionJson & { refersTo: RefersTo[]; events: ExtractedEvent[]; cut: boolean };
const Phrases = z.record(z.string(), z.unknown());
const Event = z.object({ what: z.string(), who: z.array(z.string()), at: z.int() });
const extractAccepter =
  (cast: readonly string[]) =>
  (cut: boolean) =>
  (data: unknown): Extracted | null => {
    const d = typeof data === 'object' && data !== null ? data : {};
    const said = 'refersTo' in d ? Phrases.safeParse(d.refersTo).data : undefined;
    // The reply's keys come in grammar order, so the last one present is where a cut fell.
    const inEvents = cut && 'events' in d;
    const inRefs = cut && !inEvents && !!said;
    const l = lists(data, cut && !inRefs);
    if (!l) return null;
    const r = Schema.safeParse({ ...l.data, entities: l.items('entities', ExtractedEntity, MAX_ENTITIES) });
    // Repair closes a phrase cut at the cap: the last one written is unfinished.
    const keys = Object.keys(said ?? {}).slice(0, inRefs ? -1 : undefined);
    const refs = keys.flatMap((name) => (cast.includes(name) && typeof said?.[name] === 'string' && said[name].trim() ? [{ name, phrase: said[name] }] : []));
    return r.success ? { ...r.data, refersTo: refs, events: l.items('events', Event, MAX_EVENTS), cut: cut && !said && !inEvents } : null;
  };

/**
 * Without `state` the reply still ran past 300 and 500 in 3 of 3 calls: the grammar lets the 12B
 * pretty-print, and it fills every look key ("none"). At 300 the cut fell in `entities`, at 500 in
 * `speakers`, so 500 stays. [measured: 2026-10-13-batch-m13-4.json, 2026-10-13-batch-m13-4-at500.json]
 * On one line (`extractGrammar`) replies take 260–389, so 500 is headroom. [measured: 2026-10-16-batch-m17-3.json]
 * With `events` 500 cut 3 of 6 calls, one inside `entities` in both runs; at 600, 0 of 12, the longest 590.
 * [measured: 2026-10-17-batch-m19-5-events*.json, -at600*.json, -final*.json]
 * With `goal` 600 cut 2 of 15 calls. [measured: 2026-10-17-batch-m21-3-goals.json]
 */
const EXTRACT_TOKENS = 650;

/**
 * The combined helper call: entities for one passage whose paragraphs are numbered by action index, and with `cast`
 * (the known characters' names) the roles it calls them by. Null when the reply is unusable.
 */
export function extractFromPassage(passage: string, knownNames: readonly string[], cast: readonly string[], deps: ExtractDeps): Promise<Extracted | null> {
  return helperJson(
    (g) => extractPrompt(passage, knownNames, g, cast.length > 0),
    grammarOf(extractionJson(cast)),
    EXTRACT_TOKENS,
    extractAccepter(cast),
    deps,
    'entity',
    extractGrammar(cast),
  );
}

/**
 * One combined call over the oldest `ENTITY_BATCH` memories (each call costs ~26 s on slot 1, so
 * ranges share it [measured: 2026-10-08-recall-wave2-run1.json]) not yet extracted, as one passage.
 * `scriptState.__entitiesAt` advances past them once the call ends, unusable reply included,
 * but not when typing cut the call: it is retried on the next idle run. A reply cut at its cap
 * lost the entities after the cut, so it advances past the first memory only and the next call
 * reads the rest again; one memory per call is still progress. [provisional]
 */
export async function catchUpEntities(adventure: Adventure, deps: ExtractDeps & Pick<MaintenanceDeps, 'signal'>): Promise<EntityUpdate> {
  const done = adventure.scriptState.__entitiesAt ?? 0;
  const due = adventure.memories.filter((m) => !m.stale && m.toAction > done).toSorted((a, b) => a.fromAction - b.fromAction);
  const first = due[0];
  const last = due[ENTITY_BATCH - 1];
  if (!first || !last || (deps.signal?.aborted && !entitiesOverdue(adventure))) return { touched: 0 };
  const r = await updateEntities(adventure, { fromAction: first.fromAction, toAction: last.toAction }, deps);
  adventure.scriptState = { ...adventure.scriptState, __entitiesAt: r.reply?.cut ? first.toAction : last.toAction };
  return { touched: r.touched, ...(r.log && { log: r.log }) };
}

export interface EntityUpdate {
  /** Entities created or changed. */
  touched: number;
  /** The helper's reply, when there was a usable one. */
  reply?: Extracted;
  /** What the fold proposed and dropped, for a batch call that had a reply. */
  log?: FoldLog;
}

/** Extract from the range's actions, fold the result into `adventure.entities` and store the roles it names. */
export async function updateEntities(adventure: Adventure, range: MemoryRange, deps: ExtractDeps): Promise<EntityUpdate> {
  const passage = passageOf(adventure, range);
  const known = adventure.entities.map((e) => e.name);
  // The characters the passage names, latest seen first: one asked about with no mention has nothing to give.
  const text = words(passage);
  const ix = indexAssertions(adventure.assertions);
  const labels = castLabels(adventure.entities, ix);
  const byLabel = new Map(
    adventure.entities
      .filter((e) => e.kind === 'character' && namesOf(e).some((n) => n.trim() !== '' && text.includes(words(n))))
      .toSorted((a, b) => b.lastSeen - a.lastSeen)
      .map((e) => [labels.get(e.id) ?? e.name, e]),
  );
  const reply = passage ? await extractFromPassage(passage, known, [...byLabel.keys()].slice(0, MAX_REFERS), deps) : null;
  if (!reply) return { touched: 0 };
  const log: FoldLog = { proposed: 0, rejected: [] };
  const before = adventure.entities;
  const touched = foldEntities(adventure, reply.entities, passage, range, { twice: true, log });
  fileRooms(adventure, before, passage, range.toAction);
  foldEvents(adventure, reply.events, range, byLabel, (entity, value) => log.rejected.push({ entity, value, reason: 'event-rejected', passageRange: range }));
  adventure.entities = acceptRoles(
    adventure.entities,
    reply.refersTo,
    passage,
    (entity, value) => log.rejected.push({ entity, value, reason: 'role-rejected', passageRange: range }),
    ix,
  );
  // Calls are sequential: the last one logged is this one.
  const call = deps.cuts?.calls?.at(-1);
  if (call?.job === 'entity') {
    call.factsProposed = log.proposed;
    call.accepted = touched;
    call.rejected = log.rejected.map((r) => ({ value: `${r.entity}: ${r.value}`, reason: r.reason }));
  }
  return { touched, reply, log };
}
