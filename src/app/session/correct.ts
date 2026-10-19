// Only start-up members of the barrel: importing a lazy one splits it out of the start-up chunk.
import { byPlayer, loadMemoryJobs, YOU } from '@core/memory';
import { newId, type Entity } from '@core/model';
import type { GameSession } from './session';

const ABOUT_YOU = /^(?:you|your|yours|yourself|i|i'm|my|me)\b/i;
const MY_NAME = /^(?:I am|I'm|[Yy]ou are) (\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)?)\.?$/u;

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
  // A correction that opens on the player ("You are…", "I am…") is about the player, whoever else it names.
  const e = ABOUT_YOU.test(t) ? { id: YOU, name: 'you' } : jobs.entityNamedIn(host.adv.entities, t);
  // "I am Rowan": just a name is the player's name, when they have none yet.
  const name = host.adv.plot.thirdPerson?.name.trim() ? undefined : MY_NAME.exec(t)?.[1];
  host.mutate((log, adv) => {
    if (e) adv.assertions = [...adv.assertions, { ...byPlayer(e.id, log.actions.length, { kind: 'trait', text: t }), pinned: true }];
    else adv.plot = { ...adv.plot, plotEssentials: [adv.plot.plotEssentials, t].filter(Boolean).join('\n') };
    if (name) adv.plot = { ...adv.plot, thirdPerson: { enabled: adv.plot.thirdPerson?.enabled ?? false, name } };
  });
  host.emit({ notice: `${e ? `Pinned to ${e.name}` : 'Added to Plot Essentials'}${name ? `; your name is ${name}` : ''}` });
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
      relations: [],
      firstSeen: at,
      lastSeen: at,
    };
    adv.entities = [...adv.entities, item];
  });
  host.emit({ notice: `${n} added as an item` });
}

/** "This is <character>": the selected words become an alias of `entityId`; a pending proposal of that name is answered. */
export function addAlias(host: GameSession, entityId: string, name: string): void {
  const n = name.trim();
  const e = host.adv.entities.find((x) => x.id === entityId);
  if (!n || !e) return;
  host.mutate((_, adv) => {
    const { __aliasProposals: asks, ...rest } = adv.scriptState;
    const left = asks?.filter((q) => q.name.toLowerCase() !== n.toLowerCase());
    adv.scriptState = { ...rest, ...(left !== undefined && left.length > 0 && { __aliasProposals: left }) };
    adv.entities = adv.entities.map((x) => (x.id === entityId ? { ...x, aliases: [...x.aliases, n] } : x));
  });
  host.emit({ notice: `${n} is now ${e.name}` });
}
