// Only `loadMemoryJobs`: importing more from the barrel splits it out of the start-up chunk.
import { loadMemoryJobs } from '@core/memory';
import { newId, type Adventure, type Rule } from '@core/model';
import type { GameSession } from './session';

const edit = (adv: Adventure, id: string, p: Partial<Rule>) => (adv.rules = adv.rules.map((r) => (r.id === id ? { ...r, ...p } : r)));

/** A deleted entity leaves its rules' gates; a merged one hands them to `to`. */
export function repointGates(adv: Adventure, from: string, to?: string): void {
  adv.rules = adv.rules.map((r) => (r.gates.includes(from) ? { ...r, gates: [...new Set(r.gates.flatMap((g) => (g !== from ? [g] : to ? [to] : [])))] } : r));
}

/**
 * `/rule …`: a confirmed player rule gated on every entity the text names, so "Kobolds fear fire"
 * is sent while a kobold is in play; a text naming no one is always sent. Never an action.
 */
export async function addRule(host: GameSession, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const jobs = await loadMemoryJobs().catch((err: unknown) => host.onError(`Could not save the rule: ${String(err)}`));
  if (!jobs || host.getSnapshot().busy) return;
  const gates = host.adv.entities.filter((e) => jobs.entityNamedIn([e], t)).map((e) => e.id);
  host.mutate((log, adv) => {
    const rule: Rule = { id: newId('rule_'), text: t, gates, source: 'player', status: 'confirmed', createdAt: Date.now(), fromAction: log.actions.length };
    adv.rules = [...adv.rules, rule];
  });
  const names = host.adv.entities.filter((e) => gates.includes(e.id)).map((e) => e.name);
  host.emit({ notice: names.length ? `Rule added, sent with ${names.join(', ')}` : 'Rule added, always sent' });
}

/** The last passage the story wrote: what "Find rules in the last passage" reads; -1 when none. */
export const lastPassage = (adv: Adventure): number => adv.actions.findLastIndex((a) => a.type === 'start' || a.type === 'continue' || a.type === 'story');

/** "Find rules": one slot-1 read of action `at`; its rules are appended as story proposals for the Rules tab. Not while busy. */
export async function findRulesIn(host: GameSession, at: number): Promise<void> {
  try {
    const jobs = await loadMemoryJobs();
    if (host.getSnapshot().busy) return;
    const found = await jobs.findRules(host.adv, await host.helperModel('check'), at);
    if (found.length) host.mutate((_, adv) => (adv.rules = [...adv.rules, ...found]));
    host.emit({ notice: found.length ? `Found ${found.length} rule${found.length > 1 ? 's' : ''}: confirm them in Rules` : 'No rules in this passage' });
  } catch (err) {
    host.onError(`Could not find rules: ${String(err)}`);
  }
}

/** The player's edits to `adv.rules`; lazy like `entityEdits`. */
export function ruleEdits(host: GameSession) {
  const mutate = (fn: (adv: Adventure) => void) => host.mutate((_, adv) => fn(adv));
  return {
    /** A confirmed player rule with the given gates (a card's "+ rule about <name>"). */
    add: (text: string, gates: string[]) =>
      host.mutate((log, adv) => {
        adv.rules = [
          ...adv.rules,
          { id: newId('rule_'), text, gates, source: 'player', status: 'confirmed', createdAt: Date.now(), fromAction: log.actions.length },
        ];
      }),
    update: (id: string, p: Partial<Pick<Rule, 'text' | 'gates' | 'status'>>) => mutate((adv) => edit(adv, id, p)),
    delete: (id: string) => mutate((adv) => (adv.rules = adv.rules.filter((r) => r.id !== id))),
  };
}
