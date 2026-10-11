import type { Adventure, ExtractedEntity } from '../model/types';
import { actionText } from '../model/types';
import { FACT_CHARS, INTRODUCED_CHARS, LOOK_CHARS } from '../schema/extraction';
import { knownAs, matchEntity, mergeEntity, namedInPassage, within, type Sighting } from './entities';
import { sourceIn, type Source } from './invalidate';
import type { MemoryRange } from './memoryBank';
import { supportOf } from './support';

/** The player and how the story addresses them, and a role the grammar let through by capitalising its article ("The creature"). */
export const NOT_A_NAME = /^\s*(?:you|master|mistress|sir|madam|my lord|my lady)\s*$|^(the|a|an) \p{Ll}/iu;

/** Not an entity: `NOT_A_NAME`, or the player's own name in a third-person adventure. */
export const notAName = (plot: Adventure['plot'], name: string): boolean =>
  NOT_A_NAME.test(name) || (!!plot.thirdPerson?.enabled && name.trim().toLowerCase() === plot.thirdPerson.name.trim().toLowerCase());

/** Capitalised runs, a possessive inside one kept ("Deadman's Gulch"); a leading stop word is dropped ("Then Mira" → "Mira"). */
const CAPITALISED = /\p{Lu}\p{Ll}+(?:['’]s)?(?: \p{Lu}\p{Ll}+(?:['’]s)?)*/gu;

/** Capitalised mid-sentence often enough to pass `namedInPassage`, never a name. "The" stays: "The Ashen Order" is one name. [provisional] */
const STOP = new Set('you an it they we he she but and then when day night dawn morning midday afternoon evening his her its their your our my'.split(' '));

/** Names in `text` not yet recorded: capitalised mid-sentence (or there once), not `known` (names and aliases). */
export function candidateNames(text: string, known: readonly string[]): string[] {
  const seen = new Set(known.map((k) => k.toLowerCase()));
  const out: string[] = [];
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
  return names.filter((n) => !knownAs(adventure.entities, n) && !names.some((k) => partOf(n, k)));
}

/** A description that makes the name a kind of creature, not one of them ("Kobolds are a race of…"). */
const A_KIND = /^(?:[^,.]* (?:is|are) )?(?:a|an|the) (?:species|race|kind|type) of\b/i;

/** An appearance that says there is none: the 12B fills the field anyway ("Not described in the passage"). [measured: 2026-10-09-live-play-m11-2.json] */
const NO_LOOKS = /\bnot (?:described|mentioned|stated|shown|given|specified)\b|^(?:unknown|none(?: specified| given)?|n\/a)\.?$/i;

/** The shortest sentence cap: a value this long with no closing punctuation was cut by it. */
const CUT_AT = Math.min(FACT_CHARS, INTRODUCED_CHARS);

/** A value the grammar's cap (`at`) cut, back to its last sentence end, else its last comma; `''` when nothing whole is left. */
export function uncut(text: string, at = CUT_AT): string {
  const t = text.trim();
  // `text`, not `t`: a cut that ended on a space is still at the cap.
  if (text.length < at || /[.!?]["”’)]?$/u.test(t)) return t;
  const end = Math.max(...['. ', '! ', '? '].map((p) => t.lastIndexOf(p)));
  if (end > 0) return t.slice(0, end + 1);
  const comma = t.lastIndexOf(',');
  return comma > 0 ? t.slice(0, comma) : '';
}

/** A value of a reply a guard dropped, so every run shows what the guards cost. `entity-dropped`: a fact of an entity the name rules dropped. */
export interface Rejected {
  entity: string;
  value: string;
  reason: 'description-containment' | 'state-text' | 'no-shared-word' | 'wrong-subject' | 'entity-dropped';
  passageRange: MemoryRange;
}

/** What the batch call's fold proposed and dropped. */
export interface FoldLog {
  /** Trait facts the replies carried, the dropped entities' too. */
  proposed: number;
  rejected: Rejected[];
}

/** One reply entity; the introduction call's carry no facts or state. */
export type Incoming = Omit<ExtractedEntity, 'facts'> & { facts?: string[] | undefined };

type Held = NonNullable<Adventure['scriptState']['__pending']>[number];

/** Held names kept; an older one is dropped with its facts. [provisional] */
const MAX_HELD = 20;

/**
 * Folds the helper's entities read from `range` into `adventure.entities`. A new one only when the
 * passage names it; a name `knownAs` resolves merges there as an alias. Each fact, state and look
 * value is kept only with support in the range (`supportOf`, which also stamps its source and
 * basis); looks only for characters. A state value then replaces its key's current one. With
 * `twice` (the batch call), a new name needs two actions so far that name it: once, every
 * capitalised name became a card (20 against 12). [measured: 2026-10-11-recall-m12-1-pr2-hybrid-d30.json]
 * A name seen once is held (`scriptState.__pending`) and folded, with its own range, once a card
 * it resolves to exists: its first facts were lost before. A fact the description or a state already says is dropped too. `log` counts the trait facts
 * proposed and records every value a guard dropped. Returns how many entities changed.
 */
export function foldEntities(
  adventure: Adventure,
  incoming: readonly Incoming[],
  passage: string,
  range: MemoryRange,
  opts: { twice?: boolean; log?: FoldLog } = {},
): number {
  let entities = adventure.entities;
  const actions = adventure.actions.slice(range.fromAction, range.toAction);
  const fallback = sourceIn(adventure.actions, range);
  const once = (name: string) => adventure.actions.slice(0, range.toAction).filter((a) => namedInPassage(name, actionText(a))).length < 2;
  const held: Held[] = [];
  for (const item of incoming) {
    const { looks, state, facts = [], ...e } = item;
    const description = uncut(e.description);
    if (opts.log) opts.log.proposed += facts.length;
    const old = notAName(adventure.plot, e.name) ? undefined : knownAs(entities, e.name);
    if (!old && (notAName(adventure.plot, e.name) || !namedInPassage(e.name, passage) || A_KIND.test(description))) {
      for (const f of facts) opts.log?.rejected.push({ entity: e.name, value: f, reason: 'entity-dropped', passageRange: range });
      continue;
    }
    if (!old && opts.twice && once(e.name)) {
      held.push({ entity: { ...item, facts }, range });
      continue;
    }
    const aliases = [...(e.aliases ?? []), ...(old && !matchEntity([old], e.name) ? [e.name] : [])];
    const who = { name: old?.name ?? e.name, aliases: [...(old?.aliases ?? []), ...aliases] };
    const backed = new Map<string, Source>();
    const reject = (value: string, reason: Rejected['reason']) => opts.log?.rejected.push({ entity: who.name, value, reason, passageRange: range });
    const keep = (value: string, cap?: number): string[] => {
      const v = uncut(value, cap);
      if (!v || NO_LOOKS.test(v)) return [];
      const s = supportOf(actions, who, v);
      if (typeof s === 'string') {
        reject(v, s);
        return [];
      }
      backed.set(v, s);
      return [v];
    };
    const values = { ...((old?.kind ?? e.kind) === 'character' ? looks : {}), ...state };
    const kept = Object.fromEntries(Object.entries(values).flatMap(([k, v = '']) => keep(v, LOOK_CHARS).map((t) => [k, t])));
    const states = [...(old?.facts ?? []).filter((f) => f.kind === 'state').map((f) => f.text), ...Object.entries(kept).map(([k, v]) => `${k}: ${v}`)];
    const card = old?.description || description;
    const seen: Sighting = {
      ...e,
      aliases,
      description,
      facts: facts.flatMap((f) => {
        // The 12B restates a new card's description as its first fact, and writes a state ("location: the marsh") as a fact too.
        if (within(f, card)) reject(f, 'description-containment');
        else if (states.some((s) => within(f, s))) reject(f, 'state-text');
        else return keep(f);
        return [];
      }),
      state: kept,
    };
    const merged = mergeEntity(old, seen, range.toAction - 1, (t) => backed.get(t) ?? fallback(t));
    entities = old ? entities.map((x) => (x === old ? merged : x)) : [...entities, merged];
  }
  const touched = entities.filter((x, i) => x !== adventure.entities[i]).length;
  adventure.entities = entities;
  const pending = [...(adventure.scriptState.__pending ?? []), ...held];
  const due = pending.filter((p) => knownAs(entities, p.entity.name));
  if (!held.length && !due.length) return touched;
  adventure.scriptState = { ...adventure.scriptState, __pending: pending.filter((p) => !due.includes(p)).slice(-MAX_HELD) };
  // Each was counted as proposed when it arrived; its rejections still log.
  const log = opts.log && { log: { proposed: 0, rejected: opts.log.rejected } };
  return touched + due.reduce((n, p) => n + foldEntities(adventure, [p.entity], '', p.range, log), 0);
}
