import type { Entity } from '../model/types';
import { identityText, type AssertionIndex } from './assertionIndex';

// Apart from `entities.ts` so the scene line's item lookup stays light in the start-up chunk.

export const norm = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');

/** The entity called `name`, by name or alias, ignoring case and spacing. */
export function matchEntity(entities: readonly Entity[], name: string): Entity | undefined {
  const n = norm(name);
  return entities.find((e) => norm(e.name) === n || e.aliases.some((a) => norm(a) === n));
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
  const holds = (e: Entity, part: string) => part.trim() !== '' && [e.name, ...e.aliases].some((k) => bare(k).includes(part));
  const [title = '', ...rest] = n.trim().split(' ');
  return (
    one(entities.filter((e) => holds(e, n))) ??
    (rest.length
      ? one(entities.filter((e) => holds(e, ` ${rest.join(' ')} `) && words(identityText(e, ix?.of(e.id) ?? [])).startsWith(` ${title} `)))
      : undefined) ??
    one(entities.filter((e) => n.startsWith(bare(e.name))))
  );
}
