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

/** The entity whose name, alias or role `text` contains as whole words; the longest wins, so "Lena Morrow" beats "Lena". */
export function entityNamedIn<E extends Pick<Entity, 'name' | 'aliases' | 'roles'>>(entities: readonly E[], text: string): E | undefined {
  const t = words(text);
  let best: { e: E; len: number } | undefined;
  for (const e of entities)
    for (const n of namesOf(e)) {
      const k = words(n);
      if (k.trim() && t.includes(k) && k.length > (best?.len ?? 0)) best = { e, len: k.length };
    }
  return best?.e;
}

/** The words of a name without a leading "the", so "Ashen Order" is "The Ashen Order". */
const bare = (name: string) => words(name).replace(/^ the /, ' ');
const one = (hits: Entity[]) => (hits.length === 1 ? hits[0] : undefined);

/**
 * The entity a name means: `matchEntity`, else the one entity whose name or alias holds it as
 * whole words ("Brannoch", "Ashen Order"), else the one whose name holds all but a leading title
 * its identity (`ix`) opens with ("Captain Marr" for "Captain Ysolde Marr commands…", not for Aldric,
 * "…is Captain Ysolde Marr's brother"), else the one whose name opens it ("Gull Point lighthouse").
 * A namesake's label (`castLabels`) comes first. Two candidates: none.
 */
export function knownAs(entities: readonly Entity[], name: string, ix?: AssertionIndex): Entity | undefined {
  for (const [id, label] of name.includes('(') ? castLabels(entities, ix) : []) if (label === name) return entities.find((e) => e.id === id);
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

/**
 * The enum value, by id, of each character that shares its name with another: `Lena (the miller)` from the first
 * words of its identity, else `Lena (#2)` by first sighting, so a read's enum tells them apart. [provisional]
 */
export function castLabels(entities: readonly Entity[], ix?: AssertionIndex): Map<string, string> {
  const groups = new Map<string, Entity[]>();
  for (const e of entities) if (e.kind === 'character') groups.set(norm(e.name), [...(groups.get(norm(e.name)) ?? []), e]);
  const out = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = group.toSorted((a, b) => a.firstSeen - b.firstSeen);
    const said = sorted.map((e) =>
      identityText(e, ix?.of(e.id) ?? [])
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')
        .replace(/[^\p{L}\p{N}]+$/u, ''),
    );
    const plain = said.every((w, i) => w !== '' && said.indexOf(w) === i);
    sorted.forEach((e, i) => out.set(e.id, `${e.name} (${plain ? said[i] : `#${i + 1}`})`));
  }
  return out;
}

// A scene reference is an entity id, else a plain name: someone the turn read named without a card (M13-2d).
const refFor = (pool: readonly Entity[], ref: string): string => (!ref.trim() || pool.some((e) => e.id === ref) ? ref : (knownAs(pool, ref)?.id ?? ref));
const nameOf = (entities: readonly Entity[], ref: string): string => entities.find((e) => e.id === ref)?.name ?? ref;

/** Changes of who is present kept for witnessed-by clauses. [provisional] */
export const PRESENCE_CAP = 200;
const key = (ids: readonly string[]) => ids.toSorted().join('\n');

/**
 * `plot.presence` with who is with you in `scene` from action `at` on, when it differs from the last entry; a turn read and a
 * hand edit both log here. One in another room is not with you, so witnessed-by gives them an away gap with no new kind.
 */
export function withPresence(plot: PlotComponents, scene: Pick<Scene, 'present' | 'zones'>, at: number): PlotComponents['presence'] {
  const present = scene.present.filter((p) => !scene.zones?.[p]);
  if (key(plot.presence?.at(-1)?.present ?? []) === key(present)) return plot.presence;
  return [...(plot.presence ?? []), { at, present: [...present] }].slice(-PRESENCE_CAP);
}

/** The outermost place `e` is part of, so a room inside the current place is not a move. */
export function outermost(places: readonly Entity[], e: Entity | undefined): Entity | undefined {
  const seen = new Set<string>();
  let p = e;
  while (p?.partOf && !seen.has(p.id)) {
    seen.add(p.id);
    const up: string = p.partOf;
    const next = places.find((x) => x.id === up);
    if (!next) break;
    p = next;
  }
  return p;
}

/** The other places inside `here`'s outermost place, by name: the rooms someone can go to without leaving. */
export function roomsOf(places: readonly Entity[], here: Entity | undefined): string[] {
  const top = outermost(places, here);
  return top ? places.filter((p) => p !== here && outermost(places, p) === top).map((p) => p.name) : [];
}

/** `zones` with each key passed through `f`. */
const zonesBy = (zones: Scene['zones'], f: (ref: string) => string) => zones && { zones: Object.fromEntries(Object.entries(zones).map(([k, v]) => [f(k), v])) };

/** `scene` with each name `knownAs` resolves (a place for the location, a character for the present and `zones`) as its id; unchanged: `scene` itself. */
export function sceneIds(scene: Scene, entities: readonly Entity[]): Scene {
  const places = entities.filter((e) => e.kind === 'place');
  const location = scene.location === undefined ? undefined : refFor(places, scene.location);
  const people = entities.filter((e) => e.kind === 'character');
  const present = [...new Set(scene.present.map((p) => refFor(people, p)))];
  const zones = zonesBy(scene.zones, (k) => refFor(people, k));
  const same =
    location === scene.location &&
    present.length === scene.present.length &&
    present.every((p, i) => p === scene.present[i]) &&
    JSON.stringify(zones?.zones) === JSON.stringify(scene.zones);
  return same ? scene : { ...scene, ...(location !== undefined && { location }), present, ...zones };
}

/** `scene` with its ids as the entities' current names, for the prompt and the player. */
export const sceneNames = (scene: Scene, entities: readonly Entity[]): Scene => ({
  ...scene,
  ...(scene.location !== undefined && { location: nameOf(entities, scene.location) }),
  present: scene.present.map((p) => nameOf(entities, p)),
  ...zonesBy(scene.zones, (k) => nameOf(entities, k)),
});
