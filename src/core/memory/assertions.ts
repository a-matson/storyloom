import type { Action, Adventure, Assertion, Entity, EntityFact } from '../model/types';
import { basisOf, holds } from './invalidate';
import { currentStates, isCurrentState, LOOK_KEYS } from './looks';

/** `wearing` changes scene to scene, so it is a state, not a look. */
const isLook = (key: string) => key !== 'wearing' && (LOOK_KEYS as readonly string[]).includes(key);

const PRODUCER = { memory: 'legacy', player: 'player', card: 'card' } as const;

/** One stored fact as an assertion; undefined for a conflict on a key the player has unlocked. */
function fromFact(e: Entity, f: EntityFact, actions: readonly Action[]): Assertion | undefined {
  const i = f.sourceId === undefined ? -1 : actions.findIndex((a) => a.id === f.sourceId);
  const source = actions[i];
  const common = {
    id: `as_${f.id}`,
    subject: e.id,
    producer: PRODUCER[f.source],
    at: i >= 0 ? i : f.fromAction,
    ...(source && f.evidence && holds(source, f.evidence) && { span: f.evidence }),
    basis: f.sourceId === undefined && f.source === 'memory' ? 'legacy' : basisOf(f),
    since: f.fromAction,
    ...(f.until !== undefined && { until: f.until }),
    ...(f.pinned && { pinned: true }),
  } as const;
  if (f.conflict) {
    const key = f.claim?.key;
    if (!f.claim || key === undefined || !e.canonKeys?.includes(key)) return undefined;
    return { ...common, kind: 'conflict', key, claimed: f.claim.value, canon: currentStates(e)[key] ?? '' };
  }
  if (f.kind === 'state' && f.key !== undefined) return { ...common, kind: isLook(f.key) ? 'look' : 'state', key: f.key, value: f.value ?? f.text };
  if (f.kind === 'effect') return { ...common, kind: 'effect', condition: f.value ?? f.text, ...(f.cause && { cause: f.cause }) };
  if (f.kind === 'relationship') return { ...common, kind: 'relationship', to: f.key ?? 'you', stance: f.value ?? f.text };
  return { ...common, kind: 'trait', text: f.text };
}

/** The description, the player's `state` map and the free-text appearance: none has a source action. */
function fromFields(e: Entity): Assertion[] {
  const at = e.firstSeen;
  const out: Assertion[] = [];
  const description = e.description.trim();
  if (description)
    out.push({
      id: `as_id_${e.id}`,
      subject: e.id,
      producer: e.canon || e.cardId ? 'card' : 'legacy',
      at,
      basis: 'legacy',
      since: at,
      kind: 'identity',
      text: description,
    });
  // A current fact of the same key overrides a map value (`currentStates`), so that value has ended.
  const live = new Set(e.facts.filter(isCurrentState).map((f) => f.key));
  for (const [key, value] of Object.entries(e.state))
    out.push({
      id: `as_st_${e.id}_${key}`,
      subject: e.id,
      producer: 'player',
      at,
      basis: 'player',
      since: at,
      ...(live.has(key) && { until: e.lastSeen }),
      kind: isLook(key) ? 'look' : 'state',
      key,
      value,
    });
  const appearance = e.appearance?.trim();
  if (appearance)
    out.push({ id: `as_lk_${e.id}`, subject: e.id, producer: 'legacy', at, basis: 'legacy', since: at, kind: 'look', key: 'legacy', value: appearance });
  return out;
}

/**
 * Every entity's facts and fields as typed assertions. Pure and idempotent: ids come from the fact
 * and entity ids, so a second run over the same adventure gives equal values.
 */
export function deriveAssertions(adventure: Pick<Adventure, 'entities' | 'actions'>): Assertion[] {
  return adventure.entities.flatMap((e) => [...fromFields(e), ...e.facts.flatMap((f) => fromFact(e, f, adventure.actions) ?? [])]);
}
