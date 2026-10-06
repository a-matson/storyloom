import { jsonrepair } from 'jsonrepair';
import type { Adventure, ExtractionJson, Speaker } from '../model/types';
import { collect } from '../ports/provider';
import { z } from 'zod/mini';
import { ExtractedEntity, ExtractionJson as Schema } from '../schema/extraction';
import { actionStoryText } from '../text/formatting';
import { parseJsonReply } from '../text/jsonReply';
import { EXTRACT_SYSTEM, extractPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { attributeSpeakers, matchEntity, mergeEntity } from './entities';
import { EXTRACT_JSON_SCHEMA } from './extractJsonSchema';
import type { MemoryRange } from './memoryBank';
import type { MaintenanceDeps } from './memoryJobs';

/** The call needs no embedder, so the player's "Update from story" works without one. */
type ExtractDeps = Pick<MaintenanceDeps, 'provider' | 'template' | 'cancel'>;

// Entities are checked one by one, so a bad one (a lowercase name without the grammar) costs only itself.
const Envelope = z.looseObject({ entities: z.array(z.unknown()) });

/**
 * A reply cut at maxTokens loses `speakers` after repair (the entities before it are whole), and
 * repair closes its last entity mid-fact, so that one is dropped.
 */
const accepter =
  (cut: boolean) =>
  (data: unknown): ExtractionJson | null => {
    const loose = Envelope.safeParse(data);
    if (!loose.success) return null;
    const entities = (cut ? loose.data.entities.slice(0, -1) : loose.data.entities).flatMap((e) => {
      const one = ExtractedEntity.safeParse(e);
      return one.success ? [one.data] : [];
    });
    const r = Schema.safeParse({ speakers: [], ...loose.data, entities });
    return r.success ? r.data : null;
  };

/**
 * The combined helper call: entities, speakers, importance, time and threads for one passage
 * whose paragraphs are numbered by action index. Null when the reply is unusable or cut.
 */
export async function extractFromPassage(passage: string, knownNames: string[], deps: ExtractDeps): Promise<ExtractionJson | null> {
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(deps.template, EXTRACT_SYSTEM, extractPrompt(passage, knownNames), caps.jsonSchema ? '' : '{');
  const { text, stats } = await trackJob('entity', () =>
    collect(
      deps.provider.complete(
        {
          prompt: rendered.prompt,
          maxTokens: 500,
          temperature: 0.2,
          topP: 0.9,
          stop: rendered.stop,
          cachePrompt: false,
          slotId: 1,
          jsonSchema: caps.jsonSchema ? EXTRACT_JSON_SCHEMA : undefined,
        },
        deps.cancel,
      ),
    ),
  );
  if (deps.cancel?.aborted) return null;
  return parseJsonReply(caps.jsonSchema ? text : `{${text}`, accepter(stats?.stopReason === 'length'), jsonrepair);
}

/** Memory ranges extracted per idle run, so an old adventure's catch-up does not hold slot 1. [provisional] */
const ENTITY_BATCH = 2;

/** The player, and a role the grammar let through by capitalising its article ("The creature"). */
const NOT_A_NAME = /^\s*you\s*$|^(the|a|an) \p{Ll}/iu;

/**
 * The combined call for each memory not yet extracted, oldest first, up to `ENTITY_BATCH`.
 * `scriptState.__entitiesAt` advances past a memory once its call ends, unusable reply included,
 * but not when the call was cut: a cut call is retried on the next idle run.
 */
export async function catchUpEntities(adventure: Adventure, deps: MaintenanceDeps): Promise<EntityUpdate> {
  const total: EntityUpdate = { touched: 0, speakers: new Map() };
  const done = adventure.scriptState.__entitiesAt ?? 0;
  const due = adventure.memories.filter((m) => !m.stale && m.toAction > done).toSorted((a, b) => a.fromAction - b.fromAction);
  for (const m of due.slice(0, ENTITY_BATCH)) {
    if (deps.signal?.aborted) break;
    const r = await updateEntities(adventure, m, deps);
    if (deps.cancel?.aborted) break;
    total.touched += r.touched;
    for (const [id, s] of r.speakers) total.speakers.set(id, s);
    adventure.scriptState = { ...adventure.scriptState, __entitiesAt: m.toAction };
  }
  return total;
}

export interface EntityUpdate {
  /** Entities created or changed. */
  touched: number;
  /** Speaker labels by action id, for `ActionLog.annotate`: actions live in the log, not on `adventure`. */
  speakers: Map<string, Speaker[]>;
}

/** Extract from the range's actions and fold the result into `adventure.entities`. */
export async function updateEntities(adventure: Adventure, range: MemoryRange, deps: ExtractDeps): Promise<EntityUpdate> {
  const passage = adventure.actions
    .slice(range.fromAction, range.toAction)
    .map((a, i) => [range.fromAction + i, actionStoryText(a)] as const)
    .filter(([, t]) => t !== '')
    .map(([n, t]) => `[${n}] ${t}`)
    .join('\n');
  if (!passage) return { touched: 0, speakers: new Map() };
  const known = adventure.entities.map((e) => e.name);
  const reply = await extractFromPassage(passage, known, deps);
  if (!reply) return { touched: 0, speakers: new Map() };
  const at = range.toAction - 1;
  let entities = adventure.entities;
  for (const incoming of reply.entities) {
    if (NOT_A_NAME.test(incoming.name)) continue;
    const old = matchEntity(entities, incoming.name);
    const merged = mergeEntity(old, incoming, at);
    entities = old ? entities.map((e) => (e === old ? merged : e)) : [...entities, merged];
  }
  const touched = entities.filter((e, i) => e !== adventure.entities[i]).length;
  adventure.entities = entities;
  return { touched, speakers: attributeSpeakers(adventure.actions, reply.speakers, entities) };
}
