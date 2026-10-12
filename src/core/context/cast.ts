import { basisOf } from '../memory/invalidate';
import { currentStates, isCurrentState, LOOK_KEYS } from '../memory/looks';
import type { Entity, EntityFact } from '../model/types';

/** Words an identity keeps from the description's first clause. [provisional] */
export const IDENTITY_WORDS = 12;

/** One cast line and the facts it sends. */
export interface CastLine {
  entity: Entity;
  text: string;
  factIds: string[];
}

const norm = (n: string) => n.trim().toLowerCase().replace(/^the /, '');
const names = (e: Entity) => [e.name, ...e.aliases].map(norm);
const live = (f: EntityFact) => f.until === undefined && !f.text.startsWith('looked: ');
const clause = (s: string) => s.trim().replace(/[.;]+$/, '');
// Looks are the portrait's business; only what someone wears changes the scene.
const SKIP = new Set<string>(LOOK_KEYS.filter((k) => k !== 'wearing'));
/** `<condition> — <cause>`. */
const effect = (f: EntityFact) => clause(f.value ?? f.text) + (f.cause ? ` — ${clause(f.cause.text)}` : '');

/** "Lena keeps the mill. She…" → "keeps the mill": first clause, the name and a leading "is" cut, at most 12 words. */
export function identityOf(e: Entity): string {
  const first = e.description.split(/[.;:,(—–]|\s-\s/)[0] ?? '';
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

const head = (e: Entity, carded: boolean) => {
  const id = carded ? '' : identityOf(e);
  return id ? `${e.name} (${id})` : e.name;
};

/**
 * A present entity's now-line: `Name (identity): states; effects — cause; stance to you. With Other: stance.`
 * States leave out looks but `wearing`; traits go only when pinned, the player's, or a canon conflict.
 * A relationship fact's `key` is who it is towards (absent or `you`: the player).
 */
export function presentLine(e: Entity, present: readonly Entity[], carded: boolean): CastLine {
  const facts = e.facts.filter(live).toSorted((a, b) => a.fromAction - b.fromAction);
  const stateIds = new Map(e.facts.filter(isCurrentState).map((f) => [f.key, f.id]));
  const states = Object.entries(currentStates(e)).filter(([k]) => !SKIP.has(k));
  const effects = facts.filter((f) => f.kind === 'effect');
  const toward = (f: EntityFact) =>
    f.key === undefined || norm(f.key) === 'you' ? undefined : present.find((p) => p !== e && names(p).includes(norm(f.key ?? '')));
  const rels = facts.filter((f) => f.kind === 'relationship');
  const toYou = rels.filter((f) => f.key === undefined || norm(f.key) === 'you');
  const traits = facts.filter((f) => (f.kind ?? 'trait') === 'trait' && (f.pinned || f.conflict || basisOf(f) === 'player'));
  const parts = [
    states.map(([k, v]) => `${k}: ${v}`).join(', '),
    ...effects.map(effect),
    ...toYou.map((f) => clause(f.text)),
    ...traits.map((f) => clause(f.text)),
  ].filter(Boolean);
  const withOthers = present.flatMap((p) => {
    const about = rels.filter((f) => toward(f) === p);
    return about.length ? [`With ${p.name}: ${about.map((f) => clause(f.text)).join('; ')}.`] : [];
  });
  const text = [`${head(e, carded)}${parts.length ? `: ${parts.join('; ')}` : ''}.`, ...withOthers].join(' ');
  const sent = [...effects, ...toYou, ...traits, ...rels.filter((f) => toward(f))].map((f) => f.id);
  return { entity: e, text, factIds: [...states.flatMap(([k]) => stateIds.get(k) ?? []), ...sent] };
}

/** A mentioned entity's identity, nothing else; none when there is no identity to give. */
export const mentionedLine = (e: Entity, carded: boolean): CastLine[] =>
  carded || !identityOf(e) ? [] : [{ entity: e, text: `${head(e, false)}.`, factIds: [] }];

/** `Name: fact` for the player's pins and canon conflicts, sent whoever is in the scene. */
export const pinnedLines = (entities: readonly Entity[]): CastLine[] =>
  entities
    .flatMap((entity) =>
      entity.facts.filter((f) => live(f) && (f.pinned || f.conflict)).map((f) => ({ entity, text: `${entity.name}: ${f.text}`, factIds: [f.id] })),
    )
    .toSorted((a, b) => a.entity.name.localeCompare(b.entity.name));
