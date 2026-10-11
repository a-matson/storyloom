import type { Action, Adventure, EntityFact } from '../model/types';
import { actionText } from '../model/types';
import { hashPrompt } from '../trace';
import { markStale, type MemoryRange } from './memoryBank';

export interface Source {
  sourceId: string;
  sourceHash?: string | undefined;
  evidence?: string | undefined;
}

export const basisOf = (f: EntityFact): NonNullable<EntityFact['basis']> => f.basis ?? (f.source === 'memory' ? 'stated' : 'player');

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** False when the source action is gone, or its active text lost the evidence (no evidence: the text changed). Unsourced values cannot be checked. */
export function supported(p: { [K in keyof Source]?: Source[K] | undefined }, byId: ReadonlyMap<string, Action>): boolean {
  if (!p.sourceId) return true;
  const a = byId.get(p.sourceId);
  if (!a) return false;
  if (p.evidence) return flat(actionText(a)).includes(flat(p.evidence));
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

const withoutUntil = ({ until: _u, ...f }: EntityFact): EntityFact => f;

export interface Dropped {
  facts: number;
  appearances: number;
  scene: boolean;
}

/**
 * Drop the model's facts and looks whose source text changed or is gone (the player's and pinned
 * facts stay), and forget the scene's source. When a dropped value's action still exists, the
 * batch extraction is rewound to it so the next idle run re-reads the new text.
 */
export function dropUnsupported(adventure: Adventure, actions: readonly Action[]): Dropped {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const out: Dropped = { facts: 0, appearances: 0, scene: false };
  let rewind = Infinity;
  const reread = (id: string) => {
    const i = actions.findIndex((a) => a.id === id);
    if (i >= 0) rewind = Math.min(rewind, i);
  };
  adventure.entities = adventure.entities.map((e) => {
    const gone = e.facts.filter((f) => f.sourceId !== undefined && f.pinned !== true && basisOf(f) !== 'player' && !supported(f, byId));
    const looksGone = !!e.appearanceFrom && !supported(e.appearanceFrom, byId);
    if (!gone.length && !looksGone) return e;
    for (const f of gone) if (f.sourceId) reread(f.sourceId);
    out.facts += gone.length;
    // A dropped state value hands its key back to the value it ended.
    const ended = (f: EntityFact) => gone.some((g) => g.kind === 'state' && g.until === undefined && g.key === f.key && g.fromAction === f.until);
    const facts = e.facts.filter((f) => !gone.includes(f)).map((f) => (f.kind === 'state' && ended(f) ? withoutUntil(f) : f));
    if (!looksGone || !e.appearanceFrom) return { ...e, facts };
    reread(e.appearanceFrom.sourceId);
    out.appearances += 1;
    const { appearance: _a, appearanceFrom: _f, ...rest } = e;
    return { ...rest, facts };
  });
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
  dropUnsupported(adventure, after);
}

/** An edit or erase of an action the summary already read: the next refresh rebuilds it from the memories. */
export function markSummaryDirty(adventure: Adventure, changedIndexes: readonly number[]): void {
  const at = adventure.scriptState.__summaryAt ?? 0;
  if (changedIndexes.some((i) => i >= 0 && i < at)) adventure.scriptState = { ...adventure.scriptState, __summaryDirty: true };
}
