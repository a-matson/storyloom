// Only `loadMemoryJobs`: importing more from the barrel splits it out of the start-up chunk.
import { loadMemoryJobs } from '@core/memory';
import type { GameSession } from './session';

/** Characters a selection is checked for: one helper call each. [provisional] */
const MAX_NAMED = 3;

export interface Finding {
  /** The record line the selection contradicts. */
  fact: string;
  /** The action that line was read from. */
  at: number;
}

/**
 * "Check against the record": the selected text against every current assertion of each character it names,
 * one call each on slot 1. Player-run only; nothing is stored. Undefined when it did not run (busy, or failed).
 */
export async function checkSelection(host: Pick<GameSession, 'adv' | 'getSnapshot' | 'helperModel' | 'onError'>, text: string): Promise<Finding[] | undefined> {
  try {
    const jobs = await loadMemoryJobs();
    if (host.getSnapshot().busy) return undefined;
    const named = host.adv.entities.filter((e) => e.kind === 'character' && jobs.entityNamedIn([e], text) !== undefined).slice(0, MAX_NAMED);
    const found: Finding[] = [];
    for (const e of named) {
      const lines = jobs.recordLines(host.adv, [e.id]);
      const fact = await jobs.checkOutput(
        text,
        lines.map((l) => l.line),
        await host.helperModel('check'),
      );
      const hit = fact === null ? undefined : lines.find((l) => l.line === fact);
      if (hit) found.push({ fact: hit.line, at: hit.at });
    }
    return found;
  } catch (err) {
    host.onError(`Could not check the selection: ${String(err)}`);
    return undefined;
  }
}
