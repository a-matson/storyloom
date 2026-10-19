import type { Assertion } from '../model/types';
import { isCurrent } from './assertionIndex';

/** States a night or a long wait ends; `wearing`, `holds` and `condition` stay. [provisional] */
const TRANSIENT_KEYS: ReadonlySet<string> = new Set(['posture', 'mood']);

/**
 * Ends (`until: at`) each current posture and mood of `subjects` (`all`: everyone), and with `effects` each effect,
 * that began before `at`. The player's own lines and pinned ones stay.
 */
export function endTransient(
  assertions: readonly Assertion[],
  at: number,
  subjects: 'all' | readonly string[],
  opts: { effects: boolean },
): { assertions: Assertion[]; ended: number } {
  let ended = 0;
  const out = assertions.map((a) => {
    const transient = (a.kind === 'state' && TRANSIENT_KEYS.has(a.key)) || (opts.effects && a.kind === 'effect');
    const ends = transient && isCurrent(a) && a.since < at && a.producer !== 'player' && !a.pinned && (subjects === 'all' || subjects.includes(a.subject));
    if (!ends) return a;
    ended++;
    return { ...a, until: at };
  });
  return { assertions: out, ended };
}
