import type { Action, Adventure, Assertion, EntityFact } from '../model/types';
import { actionText } from '../model/types';
import { hashPrompt } from '../trace';
import type { AssertionOf } from './assertionIndex';
import { markStale, type MemoryRange } from './memoryBank';

export interface Source {
  sourceId: string;
  sourceHash?: string | undefined;
  evidence?: string | undefined;
  basis?: EntityFact['basis'];
}

export const basisOf = (f: EntityFact): NonNullable<EntityFact['basis']> => f.basis ?? (f.source === 'memory' ? 'stated' : 'player');

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Whether the action's active text holds `evidence`, ignoring case and spacing. */
export const holds = (a: Action, evidence: string): boolean => flat(actionText(a)).includes(flat(evidence));

/** False when the source action is gone, or its active text lost the evidence (no evidence: the text changed). Unsourced values cannot be checked. */
export function supported(p: { [K in keyof Source]?: Source[K] | undefined }, byId: ReadonlyMap<string, Action>): boolean {
  if (!p.sourceId) return true;
  const a = byId.get(p.sourceId);
  if (!a) return false;
  if (p.evidence) return holds(a, p.evidence);
  return p.sourceHash === undefined || hashPrompt(actionText(a)) === p.sourceHash;
}

/** The value's source: the newest action of the range holding its longest word, else the range's last action. [provisional] */
export function sourceIn(actions: readonly Action[], range: MemoryRange): (text: string) => Source | undefined {
  const newestFirst = actions.slice(range.fromAction, range.toAction).toReversed();
  return (text) => {
    const word = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).reduce((a, b) => (b.length > a.length ? b : a), '');
    const a = (word && newestFirst.find((x) => actionText(x).toLowerCase().includes(word))) || newestFirst[0];
    return a && { sourceId: a.id, sourceHash: hashPrompt(actionText(a)) };
  };
}

const withoutUntil = ({ until: _u, ...a }: Assertion): Assertion => a;
const isValue = (a: Assertion): a is AssertionOf<'state' | 'look'> => a.kind === 'state' || a.kind === 'look';

export interface Dropped {
  facts: number;
  scene: boolean;
}

/**
 * Drop the model's assertions (looks and identity included) the story no longer says: their action
 * is gone, lost their `span`, or, with no span, is among the `changed` indexes. The player's,
 * pinned and unsourced legacy ones stay. A dropped value hands its key back to the value it ended;
 * a dropped identity clears a non-canon description. The scene's source is checked likewise. When
 * a dropped value's action still exists, the batch extraction is rewound to it so the next idle run
 * re-reads the new text.
 */
export function dropUnsupported(adventure: Adventure, actions: readonly Action[], changed: ReadonlySet<number> = new Set()): Dropped {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const out: Dropped = { facts: 0, scene: false };
  const unsupported = (a: Assertion) => {
    if (a.pinned || (a.basis !== 'stated' && a.basis !== 'inferred')) return false;
    const action = actions[a.at];
    return !action || (a.span ? !holds(action, a.span) : changed.has(a.at));
  };
  const gone = adventure.assertions.filter(unsupported);
  out.facts = gone.length;
  const handedBack = (a: Assertion) =>
    isValue(a) && gone.some((g) => isValue(g) && g.subject === a.subject && g.until === undefined && g.key === a.key && g.since === a.until);
  if (gone.length) adventure.assertions = adventure.assertions.filter((a) => !gone.includes(a)).map((a) => (handedBack(a) ? withoutUntil(a) : a));
  const unnamed = new Set(gone.flatMap((g) => (g.kind === 'identity' ? [g.subject] : [])));
  if (unnamed.size) adventure.entities = adventure.entities.map((e) => (unnamed.has(e.id) && !e.canon && !e.cardId ? { ...e, description: '' } : e));
  const rewind = Math.min(...gone.flatMap((g) => (g.at < actions.length ? [g.at] : [])));
  const scene = adventure.plot.scene;
  if (scene?.sourceId && !supported(scene, byId)) {
    const { sourceId: _id, sourceHash: _hash, ...rest } = scene;
    adventure.plot = { ...adventure.plot, scene: rest };
    out.scene = true;
  }
  const done = adventure.scriptState.__entitiesAt ?? 0;
  if (rewind < done) adventure.scriptState = { ...adventure.scriptState, __entitiesAt: rewind };
  return out;
}

/**
 * The log went from `before` to `after` (edit, erase, retry, version switch, undo): memories over a
 * changed action go stale, values it no longer supports are dropped, a summary that read it is dirty.
 */
export function followLog(adventure: Adventure, before: readonly Action[], after: readonly Action[]): void {
  if (before === after) return;
  const now = new Map(after.map((a) => [a.id, actionText(a)]));
  const changed = before.flatMap((a, i) => (now.get(a.id) === actionText(a) ? [] : [{ id: a.id, i }]));
  if (changed.length) {
    adventure.memories = markStale(adventure.memories, new Set(changed.map((c) => c.id)));
    markSummaryDirty(
      adventure,
      changed.map((c) => c.i),
    );
  }
  dropUnsupported(adventure, after, new Set(changed.map((c) => c.i)));
  if (after.length < before.length) dropUnborn(adventure, after.length);
}

/**
 * An erase (F21): entities first seen at or after `n` go with their assertions and their place in the
 * scene, unless canon, carded or touched by the player. ponytail: an undo of the erase does not bring
 * them back; the next turn read re-cards a name it meets.
 */
function dropUnborn(adventure: Adventure, n: number): void {
  const touched = new Set(
    adventure.assertions.flatMap((a) => (a.pinned || (a.basis === 'player' && a.kind !== 'state' && a.kind !== 'look') ? [a.subject] : [])),
  );
  const gone = new Set(adventure.entities.flatMap((e) => (e.firstSeen >= n && !e.canon && !e.cardId && !touched.has(e.id) ? [e.id] : [])));
  if (!gone.size) return;
  adventure.entities = adventure.entities.filter((e) => !gone.has(e.id));
  adventure.assertions = adventure.assertions.filter((a) => !gone.has(a.subject));
  const scene = adventure.plot.scene;
  if (scene?.present) adventure.plot = { ...adventure.plot, scene: { ...scene, present: scene.present.filter((p) => !gone.has(p)) } };
}

/** An edit or erase of an action the summary already read: the next refresh rebuilds it from the memories. */
export function markSummaryDirty(adventure: Adventure, changedIndexes: readonly number[]): void {
  const at = adventure.scriptState.__summaryAt ?? 0;
  if (changedIndexes.some((i) => i >= 0 && i < at)) adventure.scriptState = { ...adventure.scriptState, __summaryDirty: true };
}
