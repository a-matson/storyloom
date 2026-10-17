import type { Entity, PlotComponents, Scene } from '../model/types';
import { identityText, type AssertionIndex } from './assertionIndex';

// Apart from `entities.ts` so the scene line's item lookup stays light in the start-up chunk.

export const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');

/** Every name an entity goes by: its name, aliases and roles ("the kobold"). Spelling checks and alias proposals read name and aliases only. */
export const namesOf = (e: Pick<Entity, 'name' | 'aliases' | 'roles'>): string[] => [e.name, ...e.aliases, ...(e.roles ?? [])];

/** The entity called `name`, by name, alias or role, ignoring case and spacing. */
export function matchEntity(entities: readonly Entity[], name: string): Entity | undefined {
  const n = norm(name);
  return entities.find((e) => namesOf(e).some((a) => norm(a) === n));
}

export const words = (s: string): string =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/** The words of a name without a leading "the", so "Ashen Order" is "The Ashen Order". */
const bare = (name: string) => words(name).replace(/^ the /, ' ');
const one = (hits: Entity[]) => (hits.length === 1 ? hits[0] : undefined);

/**
 * The entity a name means: `matchEntity`, else the one entity whose name or alias holds it as
 * whole words ("Brannoch", "Ashen Order"), else the one whose name holds all but a leading title
 * its identity (`ix`) opens with ("Captain Marr" for "Captain Ysolde Marr commands…", not for Aldric,
 * "…is Captain Ysolde Marr's brother"), else the one whose name opens it ("Gull Point lighthouse").
 * Two candidates: none.
 */
export function knownAs(entities: readonly Entity[], name: string, ix?: AssertionIndex): Entity | undefined {
  const exact = matchEntity(entities, name);
  if (exact) return exact;
  const n = bare(name);
  const holds = (e: Entity, part: string) => part.trim() !== '' && namesOf(e).some((k) => bare(k).includes(part));
  const [title = '', ...rest] = n.trim().split(' ');
  return (
    one(entities.filter((e) => holds(e, n))) ??
    (rest.length
      ? one(entities.filter((e) => holds(e, ` ${rest.join(' ')} `) && words(identityText(e, ix?.of(e.id) ?? [])).startsWith(` ${title} `)))
      : undefined) ??
    one(entities.filter((e) => n.startsWith(bare(e.name))))
  );
}

// A scene reference is an entity id, else a plain name: someone the turn read named without a card (M13-2d).
const refFor = (pool: readonly Entity[], ref: string): string => (!ref.trim() || pool.some((e) => e.id === ref) ? ref : (knownAs(pool, ref)?.id ?? ref));
const nameOf = (entities: readonly Entity[], ref: string): string => entities.find((e) => e.id === ref)?.name ?? ref;

/** Changes of who is present kept for witnessed-by clauses. [provisional] */
export const PRESENCE_CAP = 200;
const key = (ids: readonly string[]) => ids.toSorted().join('\n');

/** `plot.presence` with `present` from action `at` on, when it differs from the last entry; a turn read and a hand edit both log here. */
export function withPresence(plot: PlotComponents, present: readonly string[], at: number): PlotComponents['presence'] {
  if (key(plot.presence?.at(-1)?.present ?? []) === key(present)) return plot.presence;
  return [...(plot.presence ?? []), { at, present: [...present] }].slice(-PRESENCE_CAP);
}

/** `scene` with each name `knownAs` resolves (a place for the location, a character for the present) as its id; unchanged: `scene` itself. */
export function sceneIds(scene: Scene, entities: readonly Entity[]): Scene {
  const places = entities.filter((e) => e.kind === 'place');
  const location = scene.location === undefined ? undefined : refFor(places, scene.location);
  const people = entities.filter((e) => e.kind === 'character');
  const present = [...new Set(scene.present.map((p) => refFor(people, p)))];
  const same = location === scene.location && present.length === scene.present.length && present.every((p, i) => p === scene.present[i]);
  return same ? scene : { ...scene, ...(location !== undefined && { location }), present };
}

/** `scene` with its ids as the entities' current names, for the prompt and the player. */
export const sceneNames = (scene: Scene, entities: readonly Entity[]): Scene => ({
  ...scene,
  ...(scene.location !== undefined && { location: nameOf(entities, scene.location) }),
  present: scene.present.map((p) => nameOf(entities, p)),
});
