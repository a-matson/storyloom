// Only `loadMemoryJobs`: importing more from the barrel splits it out of the start-up chunk.
import { loadMemoryJobs } from '@core/memory';
import { newId, type EntityFact } from '@core/model';
import type { GameSession } from './session';

/**
 * `/correct …`: a pinned player fact on the entity the text names (pinned facts lead the facts
 * block), else a Plot Essentials line, which is always sent. Never an action; the notice says
 * where it landed so an unmatched name is visible.
 */
export async function correct(host: GameSession, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const jobs = await loadMemoryJobs().catch((err: unknown) => host.onError(`Could not save the correction: ${String(err)}`));
  if (!jobs || host.getSnapshot().busy) return;
  const e = jobs.entityNamedIn(host.adv.entities, t);
  host.mutate((log, adv) => {
    const fact: EntityFact = { id: newId('fact_'), text: t, fromAction: log.actions.length, source: 'player', pinned: true };
    if (e) adv.entities = adv.entities.map((x) => (x.id === e.id ? { ...x, facts: [...x.facts, fact] } : x));
    else adv.plot = { ...adv.plot, plotEssentials: [adv.plot.plotEssentials, t].filter(Boolean).join('\n') };
  });
  host.emit({ notice: e ? `Pinned to ${e.name}` : 'Added to Plot Essentials' });
}
