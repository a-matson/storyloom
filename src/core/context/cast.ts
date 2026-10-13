import { current, identityText, isCurrent, textOf, type AssertionIndex, type AssertionOf } from '../memory/assertionIndex';
import { currentStates, LOOK_KEYS } from '../memory/looks';
import type { Assertion, Entity } from '../model/types';

/** Words an identity keeps from the description's first clause. [provisional] */
export const IDENTITY_WORDS = 12;

/** One cast line and the assertions it sends. */
export interface CastLine {
  entity: Entity;
  text: string;
  factIds: string[];
}

const norm = (n: string) => n.trim().toLowerCase().replace(/^the /, '');
const names = (e: Entity) => [e.name, ...e.aliases].map(norm);
// `looked:` traits are the old, replaced looks.
const old = (a: Assertion) => a.kind === 'trait' && a.text.startsWith('looked: ');
const clause = (s: string) => s.trim().replace(/[.;]+$/, '');
// Looks are the portrait's business; only what someone wears changes the scene.
const SKIP = new Set<string>(LOOK_KEYS.filter((k) => k !== 'wearing'));
/** `<condition> — <cause>`. */
const effect = (a: AssertionOf<'effect'>) => clause(a.condition) + (a.cause ? ` — ${clause(a.cause.text)}` : '');

/** "Lena keeps the mill. She…" → "keeps the mill": first clause, the name and a leading "is" cut, at most 12 words. */
export function identityOf(e: Entity, as: readonly Assertion[]): string {
  const first = identityText(e, as).split(/[.;:,(—–]|\s-\s/)[0] ?? '';
  const name = new RegExp(`^(?:${[e.name, ...e.aliases].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+`, 'i');
  return first
    .trim()
    .replace(name, '')
    .replace(/^(?:is|was)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, IDENTITY_WORDS)
    .join(' ');
}

const head = (e: Entity, as: readonly Assertion[], carded: boolean) => {
  const id = carded ? '' : identityOf(e, as);
  return id ? `${e.name} (${id})` : e.name;
};

/**
 * A present entity's now-line: `Name (identity): states; effects — cause; stance to you. With Other: stance.`
 * States leave out looks but `wearing`; traits go only when pinned or the player's, with canon conflicts.
 * A relationship's `to` is who it is towards (`you`: the player).
 */
export function presentLine(e: Entity, as: readonly Assertion[], present: readonly Entity[], carded: boolean): CastLine {
  const live = as.filter((a) => isCurrent(a) && !old(a)).toSorted((a, b) => a.since - b.since);
  const states = Object.entries(currentStates(as)).filter(([k]) => !SKIP.has(k));
  const stateIds = states.flatMap(([k]) => as.findLast((a) => isCurrent(a) && (a.kind === 'state' || a.kind === 'look') && a.key === k)?.id ?? []);
  const effects = current(live, 'effect');
  const rels = current(live, 'relationship');
  const toward = (a: AssertionOf<'relationship'>) => present.find((p) => p !== e && names(p).includes(norm(a.to)));
  const toYou = rels.filter((a) => norm(a.to) === 'you');
  const traits = live.filter((a) => a.kind === 'conflict' || (a.kind === 'trait' && (a.pinned || a.basis === 'player')));
  const parts = [
    states.map(([k, v]) => `${k}: ${v}`).join(', '),
    ...effects.map(effect),
    ...toYou.map((a) => clause(a.stance)),
    ...traits.map((a) => clause(textOf(a))),
  ].filter(Boolean);
  const withOthers = present.flatMap((p) => {
    const about = rels.filter((a) => toward(a) === p);
    return about.length ? [`With ${p.name}: ${about.map((a) => clause(a.stance)).join('; ')}.`] : [];
  });
  const text = [`${head(e, as, carded)}${parts.length ? `: ${parts.join('; ')}` : ''}.`, ...withOthers].join(' ');
  const sent = [...effects, ...toYou, ...traits, ...rels.filter((a) => toward(a))].map((a) => a.id);
  return { entity: e, text, factIds: [...stateIds, ...sent] };
}

/** A mentioned entity's identity, nothing else; none when there is no identity to give. */
export const mentionedLine = (e: Entity, as: readonly Assertion[], carded: boolean): CastLine[] =>
  carded || !identityOf(e, as) ? [] : [{ entity: e, text: `${head(e, as, false)}.`, factIds: [] }];

/** `Name: fact` for the player's pins and canon conflicts, sent whoever is in the scene. */
export const pinnedLines = (entities: readonly Entity[], ix: AssertionIndex): CastLine[] =>
  entities
    .flatMap((entity) =>
      ix
        .of(entity.id)
        .filter((a) => isCurrent(a) && !old(a) && (a.pinned || a.kind === 'conflict'))
        .map((a) => ({ entity, text: `${entity.name}: ${textOf(a)}`, factIds: [a.id] })),
    )
    .toSorted((a, b) => a.entity.name.localeCompare(b.entity.name));
