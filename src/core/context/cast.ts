import { current, identityText, isCurrent, textOf, type AssertionOf } from '../memory/assertionIndex';
import { currentStates, isValue } from '../memory/looks';
import type { Assertion, Entity } from '../model/types';
import { lookIdentity } from './lookIdentity';
import type { Gap } from './witness';

/** Words an identity keeps from the description's first clause. [provisional] */
export const IDENTITY_WORDS = 12;
/** Now-line keys in the order sent; `location` is the scene line's, `holds` the item's holder. [provisional] */
export const KEY_ORDER = ['posture', 'condition', 'mood', 'wearing'] as const;
/** Words a state value keeps. [provisional] */
export const VALUE_WORDS = 4;

/** One cast line and the assertions it sends. */
export interface CastLine {
  entity: Entity;
  text: string;
  factIds: string[];
  /** What a present character missed, one per witnessed-by clause. */
  gaps?: readonly Gap[];
}

const norm = (n: string) => n.trim().toLowerCase().replace(/^the /, '');
const names = (e: Entity) => [e.name, ...e.aliases].map(norm);
// `looked:` traits are the old, replaced looks.
const old = (a: Assertion) => a.kind === 'trait' && a.text.startsWith('looked: ');
const clause = (s: string) => s.trim().replace(/[.;]+$/, '');
const short = (v: string) => v.trim().split(/\s+/).slice(0, VALUE_WORDS).join(' ');
/** `<condition> — <cause>`. */
const effect = (a: AssertionOf<'effect'>) => clause(a.condition) + (a.cause ? ` — ${clause(a.cause.text)}` : '');
/** The player's own facts: pinned, or given by Correct. */
const pinsOf = (as: readonly Assertion[]) => as.filter((a) => isCurrent(a) && !old(a) && a.kind === 'trait' && (a.pinned || a.basis === 'player'));

/**
 * "Lena keeps the mill. She…" → "keeps the mill": first clause, the name and a leading "is" cut, at most 12 words. Not cut at a comma: "A massive, winged…" (F10).
 * A non-human character's looks replace it (`lookIdentity`): the only way looks reach the story; `wearing` is the now-line's.
 */
export function identityOf(e: Entity, as: readonly Assertion[]): string {
  const looks = e.kind === 'character' ? lookIdentity(currentStates(as)) : undefined;
  if (looks) return looks;
  const first = identityText(e, as).split(/[.;:(—–]|\s-\s/)[0] ?? '';
  const name = new RegExp(`^(?:${[e.name, ...e.aliases].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+`, 'i');
  return first
    .trim()
    .replace(name, '')
    .replace(/^(?:is|was)\s+/i, '')
    .replace(/^An? (?=\S)/, (a) => a.toLowerCase())
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, IDENTITY_WORDS)
    .join(' ');
}

const head = (e: Entity, as: readonly Assertion[], carded: boolean) => {
  const id = carded ? '' : identityOf(e, as);
  return id ? `${e.name} (${id})` : e.name;
};
// Never `Name: …`: the model copies it into `Weever:` paragraphs (U14).
const lead = (e: Entity, as: readonly Assertion[], carded: boolean, parts: readonly string[]) => {
  const h = head(e, as, carded);
  if (!parts.length) return `${h}.`;
  return `${h}${h === e.name ? ' —' : ':'} ${parts.join('; ')}.`;
};

/**
 * A present character's now-line: `Name (identity): in the basement; sitting, poisoned, wary, wearing a cloak; effect — cause; stance to you; witnessed-by; speaks: voice; wants: goal; pins. With Other: stance.`
 * Looks are the portrait's; only `wearing` changes the scene. Conflicts are never sent.
 * A relationship's `to` is who it is towards (`you`: the player). `missed`: `witnessClause`s, so the model does not let them answer from what they never saw (U17).
 * `speaks`: they are likely to talk this turn, so their voice goes in; otherwise it costs tokens for nothing.
 * `room`: the room of this place they are in (`Scene.zones`), first, so the model does not put them beside you.
 * `wants`: they have been quiet a while or were nudged, so their confirmed goal goes in for the model to act on.
 */
export function presentLine(
  e: Entity,
  as: readonly Assertion[],
  present: readonly Entity[],
  carded: boolean,
  missed: readonly string[] = [],
  speaks = false,
  room = '',
  wants = false,
): CastLine {
  const live = as.filter((a) => isCurrent(a) && !old(a)).toSorted((a, b) => a.since - b.since);
  const now = currentStates(as);
  const keys = KEY_ORDER.filter((k) => now[k]?.trim());
  const stateIds = keys.flatMap((k) => as.findLast((a) => isCurrent(a) && isValue(a) && a.key === k)?.id ?? []);
  // Read B's effects are proposals until the player accepts one.
  const effects = current(live, 'effect')
    .filter((a) => a.seen !== false)
    .filter((a, i, all) => all.findIndex((b) => effect(b) === effect(a)) === i);
  const rels = current(live, 'relationship');
  const toward = (a: AssertionOf<'relationship'>) => present.find((p) => p !== e && names(p).includes(norm(a.to)));
  const toYou = rels.filter((a) => norm(a.to) === 'you');
  const pins = pinsOf(live);
  const voice = speaks ? current(live, 'voice').slice(-1) : [];
  // The batch read's goal is a proposal until the player confirms it.
  const goal = wants
    ? current(live, 'goal')
        .filter((a) => a.seen !== false)
        .slice(-1)
    : [];
  const parts = [
    room && `in ${room}`,
    keys.map((k) => (k === 'wearing' ? 'wearing ' : '') + short(now[k] ?? '')).join(', '),
    ...effects.map(effect),
    ...toYou.map((a) => clause(a.stance)),
    ...missed.map(clause),
    ...voice.map((a) => `speaks: ${clause(a.text)}`),
    ...goal.map((a) => `wants: ${clause(a.text)}`),
    ...pins.map((a) => clause(textOf(a))),
  ].filter(Boolean);
  const withOthers = present.flatMap((p) => {
    const about = rels.filter((a) => toward(a) === p);
    return about.length ? [`With ${p.name}: ${about.map((a) => clause(a.stance)).join('; ')}.`] : [];
  });
  const text = [lead(e, as, carded, parts), ...withOthers].join(' ');
  const sent = [...effects, ...toYou, ...voice, ...goal, ...pins, ...rels.filter((a) => toward(a))].map((a) => a.id);
  return { entity: e, text, factIds: [...stateIds, ...sent] };
}

/** A fact on an absent entity's line; a stance to someone else names them, as `With X:` does on a now-line. */
const asked = (a: Assertion) => clause(textOf(a)) + (a.kind === 'relationship' && norm(a.to) !== 'you' ? ` (${a.to.trim()})` : '');

/**
 * `Name (identity).` for a mentioned entity or an item here or held; none when there is no identity to give.
 * `facts`: what the player's last action asks about it (M19-1), `Name (identity): a; b.`. A carded entity sends none: its card is in the prompt.
 */
export function identityLine(e: Entity, as: readonly Assertion[], carded: boolean, facts: readonly Assertion[] = []): CastLine[] {
  if (carded || (!facts.length && !identityOf(e, as))) return [];
  return [{ entity: e, text: lead(e, as, false, facts.map(asked)), factIds: facts.map((a) => a.id) }];
}

/** With entity facts off: `Name (identity): pins.`, for an entity with any. */
export function pinnedLine(e: Entity, as: readonly Assertion[], carded: boolean): CastLine[] {
  const pins = pinsOf(as);
  const text = lead(
    e,
    as,
    carded,
    pins.map((a) => clause(textOf(a))),
  );
  return pins.length ? [{ entity: e, text, factIds: pins.map((a) => a.id) }] : [];
}
