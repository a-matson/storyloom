import type { Action, Adventure } from '../model/types';
import { actionText } from '../model/types';
import { identityText, indexAssertions } from './assertionIndex';
import { mergeAssertions, type Rest } from './assertionWrites';
import { COMMON_WORDS } from './commonWords';
import { knownAs, matchEntity, mergeEntity, namedInPassage } from './entities';
import { sourceIn, type Source } from './invalidate';
import { articleOnly, cuedKinds, kindOf } from './kindCues';
import type { MemoryRange } from './memoryBank';
import { sightingOf, uncut, type Incoming, type Rejected } from './sighting';
import { flagSpecies } from './species';
import { norm } from './names';
import { CAPITALISED, renameCues, withCues } from './renames';
import { spellingOf } from './spelling';

export { uncut, type Incoming, type Rejected } from './sighting';

/** The player and how the story addresses them, and a role the grammar let through by capitalising its article ("The creature"). */
export const NOT_A_NAME = /^\s*(?:you|master|mistress|sir|madam|my lord|my lady)\s*$|^(the|a|an) \p{Ll}/iu;

/** Not an entity: `NOT_A_NAME`, or the player's own name in a third-person adventure. */
export const notAName = (plot: Adventure['plot'], name: string): boolean =>
  NOT_A_NAME.test(name) || (!!plot.thirdPerson?.enabled && name.trim().toLowerCase() === plot.thirdPerson.name.trim().toLowerCase());

/** Capitalised mid-sentence often enough to pass `namedInPassage`, never a name. "The" stays: "The Ashen Order" is one name. [provisional] */
const STOP = new Set('you an it they we he she but and then when day night dawn morning midday afternoon evening his her its their your our my'.split(' '));

/** Names in `text` not yet recorded: capitalised mid-sentence (or there once), not `known` (names and aliases). */
export function candidateNames(text: string, known: readonly string[]): string[] {
  const seen = new Set(known.map((k) => k.toLowerCase()));
  const out: string[] = [];
  // A leading stop word is dropped ("Then Mira" → "Mira").
  for (const [run] of text.matchAll(CAPITALISED)) {
    const words = run.split(' ');
    while (words[0] && STOP.has(words[0].toLowerCase())) words.shift();
    // "Tamsin's boat": the name is Tamsin.
    const name = words.join(' ').replace(/['’]s$/u, '');
    if (!name || seen.has(name.toLowerCase()) || NOT_A_NAME.test(name) || !namedInPassage(name, text)) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Whether `a` is some of `b`'s whole words ("Brannoch" of "Old Brannoch"). */
const partOf = (a: string, b: string) => a.length < b.length && ` ${b.toLowerCase()} `.includes(` ${a.toLowerCase()} `);

/**
 * The range's candidate names, each action read alone; the player's third-person name is known. A
 * name `knownAs` resolves, or part of a longer new one, is that one: both became cards.
 * [measured: 2026-10-11-recall-m12-1-pr2-d30.json]
 */
export function newNamesIn(adventure: Adventure, range: MemoryRange): string[] {
  const player = adventure.plot.thirdPerson?.enabled ? [adventure.plot.thirdPerson.name] : [];
  const known = [...player, ...adventure.entities.flatMap((e) => [e.name, ...e.aliases])];
  const names = [...new Set(adventure.actions.slice(range.fromAction, range.toAction).flatMap((a) => candidateNames(actionText(a), known)))];
  const ix = indexAssertions(adventure.assertions);
  return names.filter((n) => !knownAs(adventure.entities, n, ix) && !names.some((k) => partOf(n, k)) && !notNewName(adventure, n, range));
}

/** The actions up to the range's end that write `name` as a name. */
export const sightings = (adventure: Adventure, name: string, range: MemoryRange): string[] =>
  adventure.actions
    .slice(0, range.toAction)
    .map(actionText)
    .filter((t) => namedInPassage(name, t));

/**
 * Why a new one-word name is none: a common word named in fewer than two actions so far ("Behind"), or
 * one every sighting writes after "the" that no kind cue backs ("against the Formica"; "of the Marches" stays). [provisional]
 */
export function notNewName(adventure: Adventure, name: string, range: MemoryRange): 'common' | 'article' | undefined {
  if (name.includes(' ')) return undefined;
  const seen = sightings(adventure, name, range);
  if (COMMON_WORDS.has(name.toLowerCase()) && seen.length < 2) return 'common';
  return articleOnly(name, seen) && !cuedKinds(name, seen).length ? 'article' : undefined;
}

/** A description that makes the name a kind of creature, not one of them ("Kobolds are a race of…"). */
const A_KIND = /^(?:[^,.]* (?:is|are) )?(?:a|an|the) (?:species|race|kind|type) of\b/i;

/** What the batch call's fold proposed and dropped. */
export interface FoldLog {
  /** Trait facts the replies carried, the dropped entities' too. */
  proposed: number;
  rejected: Rejected[];
}

type Held = NonNullable<Adventure['scriptState']['__pending']>[number];

/** A source by action id as where an assertion rests: the action's index, its evidence as the span. */
function restIn(actions: readonly Action[]): (s: Source | undefined) => Rest | undefined {
  const index = new Map(actions.map((a, i) => [a.id, i]));
  return (s) => {
    const at = s && index.get(s.sourceId);
    return at === undefined ? undefined : { at, ...(s?.evidence && { span: s.evidence }), ...(s?.basis && s.basis !== 'player' && { basis: s.basis }) };
  };
}

/** Held names and alias proposals kept; an older one is dropped (a held one with its facts). [provisional] */
const MAX_HELD = 20;

/**
 * Folds the helper's entities read from `range` into `adventure.entities`. A new one only when the
 * passage names it; a name `knownAs` resolves merges there as an alias. Each fact, look and stance
 * is kept only with support in the range (`supportOf`, which also stamps its source and basis);
 * looks only for characters and only `stated`. An identity (a card without one) needs support in a
 * sentence that names the entity (`supportNaming`), else the card is name and kind only. With
 * `twice` (the batch call), a new name needs two actions so far that name it: once, every
 * capitalised name became a card (20 against 12). [measured: 2026-10-11-recall-m12-1-pr2-hybrid-d30.json]
 * A name seen once is held (`scriptState.__pending`) and folded, with its own range, once a card
 * it resolves to exists: its first facts were lost before. A new name a known one's spelling
 * (`spellingOf`) or that the passage gives as its other name (`renameCues`) is held too, and proposed as its
 * alias (`__aliasProposals`) for the player to accept; a cue's name is proposed even if the reply left it out.
 * A fact the description or a state already says is dropped. `log` counts the trait facts proposed
 * and records every value a guard dropped. Returns how many entities changed or were proposed.
 */
export function foldEntities(
  adventure: Adventure,
  incoming: readonly Incoming[],
  passage: string,
  range: MemoryRange,
  /** `present`: names the scene read already put in the scene, which pass without the capital test. */
  opts: { twice?: boolean; log?: FoldLog; present?: readonly string[] } = {},
): number {
  let entities = adventure.entities;
  let assertions = adventure.assertions;
  const actions = adventure.actions.slice(range.fromAction, range.toAction);
  const fallback = sourceIn(adventure.actions, range);
  const restOf = restIn(adventure.actions);
  const held: Held[] = [];
  const cues = renameCues(passage, entities);
  const at = range.toAction - 1;
  const proposals = withCues(adventure.scriptState.__aliasProposals ?? [], cues, at);
  for (const item of incoming) {
    const { facts = [], ...e } = item;
    const raw = uncut(e.description);
    if (opts.log) opts.log.proposed += facts.length;
    const ix = indexAssertions(assertions);
    const old = notAName(adventure.plot, e.name) ? undefined : knownAs(entities, e.name, ix);
    const unnamed = () => !namedInPassage(e.name, passage) || !!notNewName(adventure, e.name, range);
    if (!old && (notAName(adventure.plot, e.name) || (!opts.present?.includes(e.name) && unnamed()) || A_KIND.test(raw))) {
      for (const f of facts) opts.log?.rejected.push({ entity: e.name, value: f, reason: 'entity-dropped', passageRange: range });
      continue;
    }
    const like = old ? undefined : (spellingOf(entities, e.name, e.kind) ?? entities.find((x) => x.id === cues.get(norm(e.name))?.of));
    if (like) proposals.push({ name: e.name, of: like.id, at });
    const seenIn = old ? [] : sightings(adventure, e.name, range);
    if (!old && (like || (opts.twice && seenIn.length < 2))) {
      held.push({ entity: { ...item, facts }, range });
      continue;
    }
    // An existing card's kind is the player's.
    const kind = old?.kind ?? kindOf(e.name, e.kind, seenIn);
    const aliases = [...(e.aliases ?? []), ...(old && !matchEntity([old], e.name) ? [e.name] : [])];
    const who = { name: old?.name ?? e.name, aliases: [...(old?.aliases ?? []), ...aliases] };
    const own = old ? assertions.filter((a) => a.subject === old.id) : [];
    const backed = new Map<string, Source>();
    const seen = sightingOf(
      { ...item, kind, facts, aliases },
      {
        actions,
        who,
        kind,
        own,
        identity: (old && identityText(old, own)) || '',
        toward: (to) => (/^you$/i.test(to) ? 'you' : knownAs(entities, to, ix)?.name),
        backed,
        reject: (value, reason) => opts.log?.rejected.push({ entity: who.name, value, reason, passageRange: range }),
      },
    );
    const merged = mergeEntity(old, seen, at);
    const producer = opts.twice ? 'batch' : 'turn';
    const mine = flagSpecies(
      merged,
      own,
      mergeAssertions(merged, own, seen, at, { producer, source: (t) => restOf(backed.get(t) ?? fallback(t)) }),
      at,
      producer,
    );
    entities = old ? entities.map((x) => (x === old ? merged : x)) : [...entities, merged];
    assertions = [...assertions.filter((a) => a.subject !== merged.id), ...mine];
  }
  // A proposal counts: the scheduler saves only on a change.
  const asked = proposals.length - (adventure.scriptState.__aliasProposals?.length ?? 0);
  const touched = entities.filter((x, i) => x !== adventure.entities[i]).length + asked;
  adventure.entities = entities;
  adventure.assertions = assertions;
  const pending = [...(adventure.scriptState.__pending ?? []), ...held];
  const due = pending.filter((p) => knownAs(entities, p.entity.name, indexAssertions(assertions)));
  if (!held.length && !due.length && !asked) return touched;
  // The newest proposal per name.
  const asks = proposals.filter((p, i) => !proposals.slice(i + 1).some((q) => q.name === p.name)).slice(-MAX_HELD);
  adventure.scriptState = {
    ...adventure.scriptState,
    __pending: pending.filter((p) => !due.includes(p)).slice(-MAX_HELD),
    ...(asks.length && { __aliasProposals: asks }),
  };
  // Each was counted as proposed when it arrived; its rejections still log.
  // Only the batch call holds names; each now has its card, so `twice` only marks the producer.
  const again = { twice: true, ...(opts.log && { log: { proposed: 0, rejected: opts.log.rejected } }) };
  return touched + due.reduce((n, p) => n + foldEntities(adventure, [p.entity], '', p.range, again), 0);
}
