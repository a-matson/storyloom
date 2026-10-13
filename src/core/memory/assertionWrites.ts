import type { Assertion, Entity } from '../model/types';
import { newId } from '../model/types';
import { current, isCurrent } from './assertionIndex';
import { within } from './entities';
import { currentStates, isValue, rivalKey, valueOf, type Fields } from './looks';
import { norm } from './names';

/** Locked keys a story value can only contradict: a different one is a conflict, a free-text one a proposal. [provisional] */
export const CLOSED_KEYS: readonly string[] = ['species', 'eyes', 'horns'];

/** Where a model value rests: the action index and, when found, the words there it rests on. */
export interface Rest {
  at: number;
  span?: string;
  basis?: 'stated' | 'inferred' | 'player';
}

/**
 * Fold what one reply says about `e` into its assertions `own`: an identity only while it has none
 * (a canon or carded entity keeps its card), each state or look value ending its key's current one
 * (an item's holder and place end each other), and traits deduped by containment, a model trait the
 * new one contains replaced by it, the player's and pinned never. A locked key (`canonKeys`) keeps
 * its value: a different closed one (`CLOSED_KEYS`) is a conflict, a free-text one a proposal
 * (`seen: false`), each once.
 */
export function mergeAssertions(
  e: Pick<Entity, 'id' | 'kind' | 'canon' | 'cardId' | 'canonKeys'>,
  own: readonly Assertion[],
  incoming: { description: string; facts: readonly string[]; state?: Record<string, string> | undefined },
  atAction: number,
  opts: { producer: Assertion['producer']; source?: ((text: string) => Rest | undefined) | undefined },
): Assertion[] {
  const list = [...own];
  const make = (from: string, f: Fields): Assertion => ({
    id: newId('as_'),
    subject: e.id,
    producer: opts.producer,
    at: atAction,
    basis: 'stated',
    ...opts.source?.(from),
    since: atAction,
    ...f,
  });

  const description = incoming.description.trim();
  if (description && !e.canon && !e.cardId && !current(list, 'identity').length) list.push(make(description, { kind: 'identity', text: description }));

  const now = currentStates(list);
  const locked = new Set(e.canonKeys);
  for (const [key, raw] of Object.entries(incoming.state ?? {})) {
    const v = raw.trim();
    const old = now[key];
    if (!norm(v) || (old !== undefined && norm(old) === norm(v))) continue;
    if (old !== undefined && locked.has(key)) {
      const closed = CLOSED_KEYS.includes(key);
      const said = (a: Assertion) =>
        isCurrent(a) &&
        (closed
          ? a.kind === 'conflict' && a.key === key && norm(a.claimed) === norm(v)
          : (a.kind === 'look' || a.kind === 'state') && a.seen === false && a.key === key && norm(a.value) === norm(v));
      if (!list.some(said)) list.push(closed ? make(v, { kind: 'conflict', key, claimed: v, canon: old }) : { ...make(v, valueOf(key, v)), seen: false });
      continue;
    }
    const rival = rivalKey(e.kind, key);
    for (const [i, a] of list.entries()) if (isCurrent(a) && isValue(a) && (a.key === key || a.key === rival)) list[i] = { ...a, until: atAction };
    list.push(make(v, valueOf(key, v)));
    now[key] = v;
  }

  for (const t of incoming.facts) {
    const text = t.trim();
    if (!norm(text)) continue;
    const i = list.findIndex((a) => a.kind === 'trait' && (within(text, a.text) || within(a.text, text)));
    const old = list[i];
    if (old?.kind === 'trait' && within(text, old.text)) continue;
    if (old && old.basis !== 'player' && !old.pinned) list[i] = { ...make(text, { kind: 'trait', text }), id: old.id };
    else list.push(make(text, { kind: 'trait', text }));
  }
  return list;
}

/**
 * `from`'s assertions moved to `into` (the player's Merge). Left out: a trait `into` already has, an
 * identity when it has one, and a current value of a key it has, so `into` keeps its own.
 */
export function mergeOwn(into: Pick<Entity, 'id'>, intoOwn: readonly Assertion[], fromOwn: readonly Assertion[]): Assertion[] {
  const traits = new Set(intoOwn.flatMap((a) => (a.kind === 'trait' ? [norm(a.text)] : [])));
  const keys = currentStates(intoOwn);
  const named = current(intoOwn, 'identity').length > 0;
  const kept = fromOwn.filter(
    (a) => !(a.kind === 'trait' && traits.has(norm(a.text))) && !(a.kind === 'identity' && named) && !(isValue(a) && isCurrent(a) && keys[a.key] !== undefined),
  );
  return [...intoOwn, ...kept.map((a): Assertion => Object.assign({}, a, { subject: into.id }))];
}
