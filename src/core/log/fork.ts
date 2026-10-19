import { followLog } from '../memory/invalidate';
import { sceneIds } from '../memory/names';
import type { Adventure, Scene } from '../model/types';

/** The scene at the fork: where the last kept move put it, with whoever the last kept presence entry had. */
function sceneAt(adv: Adventure, n: number): void {
  const { scene, sceneLog, presence } = adv.plot;
  const log = sceneLog?.filter((s) => s.at < n);
  const seen = presence?.filter((p) => p.at < n);
  adv.plot = { ...adv.plot, ...(log && { sceneLog: log }), ...(seen && { presence: seen }) };
  if (!scene) return;
  let next: Scene = scene;
  const moved = log && log.length < (sceneLog?.length ?? 0);
  if (moved) {
    // ponytail: rooms, groups and items belonged to the later place; the next scene read fills them again.
    const { zone: _z, zones: _zs, groups: _g, items: _i, since: _s, location: _l, ...rest } = scene;
    const last = log.at(-1);
    const location = last && sceneIds({ location: last.location, present: [] }, adv.entities).location;
    next = { ...rest, ...(location !== undefined && { location }), ...(last && { since: last.at }) };
  }
  if (seen && seen.length < (presence?.length ?? 0)) next = { ...next, present: seen.at(-1)?.present ?? [] };
  adv.plot = { ...adv.plot, scene: next };
}

/** `__*At` markers point past the cut: capped at it, so the jobs that keep them read the kept log from there. */
function capMarkers(state: Adventure['scriptState'], n: number): Adventure['scriptState'] {
  const capped = Object.entries(state).map(([k, v]) => [k, /^__\w+At$/.test(k) && typeof v === 'number' ? Math.min(v, n) : v] as const);
  const out: Adventure['scriptState'] = Object.fromEntries(capped);
  if (out.__pending) out.__pending = out.__pending.filter((p) => p.range.toAction <= n);
  if (out.__aliasProposals) out.__aliasProposals = out.__aliasProposals.filter((p) => p.at < n);
  // A nudge's `at` is the log length it was made at; one made at `n` still stands.
  if (out.__nudge) out.__nudge = out.__nudge.filter((p) => p.at <= n);
  return out;
}

/**
 * A copy of `adv` with the actions up to `n` (exclusive), as `id`: erase-to-here on the copy (`followLog`),
 * then everything dated at or after `n` goes and what ended there is true again. Row ids are kept: rows are
 * keyed per adventure. Time, weather and tension stay as they were (ponytail: no history of them).
 */
export function forkAt(adv: Adventure, n: number, id: string, now: number): Adventure {
  const copy = structuredClone(adv);
  Object.assign(copy, { id, title: `${adv.title} — branch`, createdAt: now, updatedAt: now });
  const kept = copy.actions.slice(0, n);
  followLog(copy, copy.actions, kept);
  copy.actions = kept;
  copy.assertions = copy.assertions.flatMap((a) => {
    if (a.at >= n || a.since >= n) return [];
    if (a.until === undefined || a.until < n) return [a];
    const { until: _u, ...rest } = a;
    return [rest];
  });
  copy.memories = copy.memories.filter((m) => m.toAction <= n);
  copy.rules = copy.rules.filter((r) => r.source === 'player' || r.fromAction < n);
  copy.entities = copy.entities.map((e) => (e.lastSeen >= n ? { ...e, lastSeen: Math.max(e.firstSeen, n - 1) } : e));
  if (copy.plot.chapters) copy.plot = { ...copy.plot, chapters: copy.plot.chapters.filter((c) => c.at < n) };
  sceneAt(copy, n);
  copy.scriptState = capMarkers(copy.scriptState, n);
  return copy;
}
