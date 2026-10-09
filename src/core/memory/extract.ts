import { jsonrepair } from 'jsonrepair';
import type { Adventure, ExtractionJson, Speaker } from '../model/types';
import { collect } from '../ports/provider';
import { z } from 'zod/mini';
import { ExtractedEntity, MAX_ENTITIES, ExtractionJson as Schema } from '../schema/extraction';
import { actionStoryText } from '../text/formatting';
import { parseJsonReply } from '../text/jsonReply';
import { EXTRACT_SYSTEM, extractPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { attributeSpeakers, matchEntity, mergeEntity, namedInPassage } from './entities';
import { EXTRACT_JSON_SCHEMA } from './extractJsonSchema';
import { entitiesOverdue, type MemoryRange } from './memoryBank';
import { nextScene } from './scene';
import type { MaintenanceDeps } from './memoryJobs';

/** The call needs no embedder, so the player's "Update from story" works without one. */
type ExtractDeps = Pick<MaintenanceDeps, 'provider' | 'template' | 'cancel'>;

// Entities are checked one by one, so a bad one (a lowercase name without the grammar) costs only itself.
const Envelope = z.looseObject({ entities: z.array(z.unknown()) });

/**
 * A reply cut at maxTokens loses `speakers` after repair (the entities before it are whole), and
 * repair closes its last entity mid-fact, so that one is dropped. Without the grammar a reply may
 * list more than `MAX_ENTITIES`; the first ones are kept.
 */
const accepter =
  (cut: boolean) =>
  (data: unknown): ExtractionJson | null => {
    const loose = Envelope.safeParse(data);
    if (!loose.success) return null;
    const whole = cut ? loose.data.entities.slice(0, -1) : loose.data.entities;
    const entities = whole.slice(0, MAX_ENTITIES).flatMap((e) => {
      const one = ExtractedEntity.safeParse(e);
      return one.success ? [one.data] : [];
    });
    const r = Schema.safeParse({ scene: {}, speakers: [], ...loose.data, entities });
    return r.success ? r.data : null;
  };

/**
 * The combined helper call: entities, speakers and scene for one passage
 * whose paragraphs are numbered by action index. Null when the reply is unusable or cut.
 */
export async function extractFromPassage(passage: string, knownNames: string[], deps: ExtractDeps): Promise<ExtractionJson | null> {
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(deps.template, EXTRACT_SYSTEM, extractPrompt(passage, knownNames, caps.jsonSchema), caps.jsonSchema ? '' : '{');
  const { text, stats } = await trackJob('entity', () =>
    collect(
      deps.provider.complete(
        {
          prompt: rendered.prompt,
          maxTokens: 300, // fits MAX_ENTITIES [measured: 2026-10-08-recall-wave2-run1.json]
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

/**
 * Memories read by one call: each call costs ~26 s on slot 1, so two ranges share it. Fewer due
 * memories wait, so a session's last memory is extracted in the next one.
 * [measured: 2026-10-08-recall-wave2-run1.json]
 */
const ENTITY_BATCH = 2;

/** The player, and a role the grammar let through by capitalising its article ("The creature"). */
const NOT_A_NAME = /^\s*you\s*$|^(the|a|an) \p{Ll}/iu;

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
    if (!old && !namedInPassage(incoming.name, passage)) continue;
    const merged = mergeEntity(old, incoming, at);
    entities = old ? entities.map((e) => (e === old ? merged : e)) : [...entities, merged];
  }
  const touched = entities.filter((e, i) => e !== adventure.entities[i]).length;
  adventure.entities = entities;
  return { touched, speakers: attributeSpeakers(adventure.actions, reply.speakers, entities), reply };
}
