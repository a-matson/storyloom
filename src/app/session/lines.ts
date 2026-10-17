// Only start-up members of the barrel: importing a lazy one splits it out of the start-up chunk.
import { byPlayer, current, isSpeciesClash, setValue, swapWord, type Fields } from '@core/memory';
import { newId, type Adventure, type Assertion, type Entity } from '@core/model';
import type { GameSession } from './session';

// Copies, not in place: the snapshot shares assertion objects with `adv`.
export const patch = (adv: Adventure, id: string, p: Partial<Entity>) => (adv.entities = adv.entities.map((e) => (e.id === id ? { ...e, ...p } : e)));
const mapLine = (adv: Adventure, lineId: string, fn: (a: Assertion) => Assertion) =>
  (adv.assertions = adv.assertions.map((a) => (a.id === lineId ? fn(a) : a)));
/** Replaces the entity's assertions with `fn` of them. */
const mapOwn = (adv: Adventure, id: string, fn: (e: Entity, own: Assertion[]) => Assertion[]) => {
  const e = adv.entities.find((x) => x.id === id);
  if (e)
    adv.assertions = [
      ...adv.assertions.filter((a) => a.subject !== id),
      ...fn(
        e,
        adv.assertions.filter((a) => a.subject === id),
      ),
    ];
};
const without = (keys: readonly string[] | undefined, key: string) => (keys ?? []).filter((k) => k !== key);

function reworded(a: Assertion, text: string): Assertion {
  if (a.kind === 'identity' || a.kind === 'trait' || a.kind === 'secret' || a.kind === 'event' || a.kind === 'voice' || a.kind === 'goal')
    return { ...a, text };
  if (a.kind === 'look' || a.kind === 'state') return { ...a, value: text };
  if (a.kind === 'effect') return { ...a, condition: text };
  if (a.kind === 'relationship') return { ...a, stance: text };
  return a;
}
// The player's words now: the story's span no longer backs them, and a proposal they rewrote is seen.
const rewritten = (a: Assertion, text: string): Assertion => {
  const { span: _s, seen: _n, ...rest } = reworded(a, text);
  return { ...rest, producer: 'player', basis: 'player' };
};

/** A card's per-line edits; the player's lines carry `basis: 'player'` and no span. No undo: the log's undo does not cover them. */
export function lineEdits(host: GameSession) {
  const mutate = (fn: (adv: Adventure, at: number) => void) => host.mutate((log, adv) => fn(adv, log.actions.length));
  return {
    /** The line stops being true now and stays as history. */
    endLine: (lineId: string) => mutate((adv, at) => mapLine(adv, lineId, (a) => ({ ...a, until: at }))),
    /** Undo of `endLine`: current again. */
    restoreLine: (lineId: string) => mutate((adv) => mapLine(adv, lineId, ({ until: _u, ...a }) => a)),
    editLine: (lineId: string, text: string) => mutate((adv) => mapLine(adv, lineId, (a) => rewritten(a, text))),
    deleteLine: (lineId: string) => mutate((adv) => (adv.assertions = adv.assertions.filter((a) => a.id !== lineId))),
    pinLine: (lineId: string) => mutate((adv) => mapLine(adv, lineId, (a) => ({ ...a, pinned: !a.pinned }))),
    addLine: (id: string, f: Fields) => mutate((adv, at) => (adv.assertions = [...adv.assertions, byPlayer(id, at, f)])),
    /** A proposal (a read's goal) is the player's to send now. */
    confirm: (lineId: string) => mutate((adv) => mapLine(adv, lineId, ({ seen: _s, ...a }) => a)),
    /** The player's goal for `id`: it ends the current one, as a read's would. */
    setGoal: (id: string, text: string) =>
      mutate((adv, at) => {
        const ended = adv.assertions.map((a) => (a.subject === id && a.kind === 'goal' && a.until === undefined ? { ...a, until: at } : a));
        adv.assertions = [...ended, byPlayer(id, at, { kind: 'goal', text })];
      }),
    /** Send `id`'s confirmed goal on the next turn however recently they acted (`nudgedIn`). */
    nudge: (id: string) =>
      mutate((adv, at) => {
        const kept = (adv.scriptState.__nudge ?? []).filter((n) => n.at === at && n.id !== id);
        adv.scriptState = { ...adv.scriptState, __nudge: [...kept, { id, at }] };
      }),
    /** The player's value for `key`; `''` clears it. */
    setValue: (id: string, key: string, value: string) => mutate((adv, at) => mapOwn(adv, id, (e, own) => setValue(e, own, key, value, at))),
    /** Lock `key` at `value`: the story can no longer change it. */
    lock: (id: string, key: string, value: string) =>
      mutate((adv, at) => {
        mapOwn(adv, id, (e, own) => setValue(e, own, key, value, at));
        patch(adv, id, { canonKeys: [...without(adv.entities.find((e) => e.id === id)?.canonKeys, key), key] });
      }),
    /** The key's conflicts and proposals go with its lock. */
    unlock: (id: string, key: string) =>
      mutate((adv) => {
        patch(adv, id, { canonKeys: without(adv.entities.find((e) => e.id === id)?.canonKeys, key) });
        const claim = (a: Assertion) => (a.kind === 'conflict' || ((a.kind === 'look' || a.kind === 'state') && a.seen === false)) && a.key === key;
        adv.assertions = adv.assertions.filter((a) => !(a.subject === id && claim(a)));
      }),
    /** Take the story's side: its value replaces the locked one; a conflict also unlocks the key, a proposal keeps it. */
    accept: (lineId: string) =>
      mutate((adv, at) => {
        const a = adv.assertions.find((x) => x.id === lineId);
        if (!a || (a.kind !== 'conflict' && a.kind !== 'look' && a.kind !== 'state')) return;
        const value = a.kind === 'conflict' ? a.claimed : a.value;
        adv.assertions = adv.assertions.filter((x) => x.id !== lineId);
        mapOwn(adv, a.subject, (e, own) => setValue(e, own, a.key, value, at));
        if (a.kind === 'conflict') patch(adv, a.subject, { canonKeys: without(adv.entities.find((e) => e.id === a.subject)?.canonKeys, a.key) });
      }),
    /** Keep canon: the conflict goes; on an identity-vs-looks one the identity takes the look's species word. */
    keepCanon: (lineId: string) =>
      mutate((adv) => {
        const a = adv.assertions.find((x) => x.id === lineId);
        adv.assertions = adv.assertions.filter((x) => x.id !== lineId);
        if (!a || !isSpeciesClash(a)) return;
        const id = current(adv.assertions, 'identity').findLast((x) => x.subject === a.subject);
        if (id) mapLine(adv, id.id, (x) => (x.kind === 'identity' ? { ...x, text: swapWord(x.text, a.claimed, a.canon) } : x));
      }),
    /** A canon or carded entity's card text; any other's identity becomes the player's, which no edit of the story drops. */
    setIdentity: (id: string, text: string) =>
      mutate((adv, at) => {
        const e = adv.entities.find((x) => x.id === id);
        if (!e) return;
        if (e.canon || e.cardId) patch(adv, id, { description: text });
        else mapOwn(adv, id, (_, own) => [...own.filter((a) => a.kind !== 'identity'), ...(text ? [byPlayer(id, at, { kind: 'identity', text })] : [])]);
      }),
    /** A new item card held by `holder` (a name). */
    addItem: (holder: string, name: string) =>
      mutate((adv, at) => {
        const item: Entity = {
          id: newId('ent_'),
          kind: 'item',
          name,
          aliases: [],
          description: '',
          relations: [],
          firstSeen: at,
          lastSeen: at,
        };
        adv.entities = [...adv.entities, item];
        adv.assertions = [...adv.assertions, byPlayer(item.id, at, { kind: 'state', key: 'holder', value: holder })];
      }),
  };
}
