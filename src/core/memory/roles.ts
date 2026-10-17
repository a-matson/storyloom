import type { Entity } from '../model/types';
import type { RefersTo } from '../schema/extraction';
import { matchEntity, norm, words } from './names';

/** Roles kept per entity, newest last. [provisional] */
export const MAX_ROLES = 4;

const ARTICLE = /^(?:the|a|an) \S/;

/**
 * The batch reply's `refersTo` stored as roles: a phrase stands when the passage holds it as whole words,
 * it opens with an article and a word ("the kobold", never "kobold" or "she"), nobody goes by it as a name or
 * alias or another's role, and its name is a character's. A phrase two names claim in one reply is dropped.
 * Returns `entities` with the roles added; `reject` hears every phrase that did not stand.
 */
export function acceptRoles(entities: readonly Entity[], refs: readonly RefersTo[], passage: string, reject: (who: string, phrase: string) => void): Entity[] {
  const claims = new Map<string, Set<string>>();
  for (const r of refs) claims.set(norm(r.phrase), (claims.get(norm(r.phrase)) ?? new Set()).add(r.name));
  const text = words(passage);
  const out = [...entities];
  for (const [phrase, names] of claims) {
    const [name] = names;
    const e = name !== undefined && names.size === 1 ? matchEntity(out, name) : undefined;
    // Free, or already this character's role (seen again, so it moves to newest).
    const owner = matchEntity(out, phrase);
    const free = !owner || (owner === e && (e.roles ?? []).includes(phrase));
    if (e?.kind !== 'character' || !free || !ARTICLE.test(phrase) || !text.includes(words(phrase))) {
      for (const n of names) reject(n, phrase);
      continue;
    }
    const i = out.indexOf(e);
    out[i] = { ...e, roles: [...(e.roles ?? []).filter((x) => x !== phrase), phrase].slice(-MAX_ROLES) };
  }
  return out;
}
