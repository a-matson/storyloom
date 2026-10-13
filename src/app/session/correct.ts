// Only start-up members of the barrel: importing a lazy one splits it out of the start-up chunk.
import { byPlayer, loadMemoryJobs } from '@core/memory';
import { newId, type Entity } from '@core/model';
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
    if (e) adv.assertions = [...adv.assertions, { ...byPlayer(e.id, log.actions.length, { kind: 'trait', text: t }), pinned: true }];
    else adv.plot = { ...adv.plot, plotEssentials: [adv.plot.plotEssentials, t].filter(Boolean).join('\n') };
  });
  host.emit({ notice: e ? `Pinned to ${e.name}` : 'Added to Plot Essentials' });
}

/** Story text the player selected, pinned as a fact about `entityId`; the selection is its evidence in that action. */
export function pinFact(host: GameSession, entityId: string, text: string, actionId: string): void {
  const t = text.trim();
  const e = host.adv.entities.find((x) => x.id === entityId);
  if (!t || !e) return;
  host.mutate((log, adv) => {
    const at = Math.max(
      0,
      log.actions.findIndex((a) => a.id === actionId),
    );
    adv.assertions = [...adv.assertions, { ...byPlayer(entityId, at, { kind: 'trait', text: t }), pinned: true, span: t }];
  });
  host.emit({ notice: `Pinned to ${e.name}` });
}

/** The selected words become an item card, unless something is already called that. */
export function makeItem(host: GameSession, name: string, actionId: string): void {
  const n = name.trim();
  if (!n) return;
  const same = (s: string) => s.toLowerCase() === n.toLowerCase();
  const known = host.adv.entities.find((e) => same(e.name) || e.aliases.some(same));
  if (known) return host.emit({ notice: `${known.name} is already recorded` });
  host.mutate((log, adv) => {
    const at = Math.max(
      0,
      log.actions.findIndex((a) => a.id === actionId),
    );
    const item: Entity = {
      id: newId('ent_'),
      kind: 'item',
      name: n,
      aliases: [],
      description: '',
      facts: [],
      state: {},
      relations: [],
      firstSeen: at,
      lastSeen: at,
    };
    adv.entities = [...adv.entities, item];
  });
  host.emit({ notice: `${n} added as an item` });
}
