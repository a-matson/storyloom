import type { Entity } from '../model/types';
import { matchEntity, norm } from './names';
import { editDistance, spellingOf } from './spelling';

/** Capitalised runs, a possessive inside one kept ("Deadman's Gulch"). */
export const CAPITALISED = /\p{Lu}\p{Ll}+(?:['’]s)?(?: \p{Lu}\p{Ll}+(?:['’]s)?)*/gu;

const CUE = String.raw`(?:or|also called|known as|as the \w+ say it)`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * New names the passage gives a known one: "Vorthak, known as Old Red" and "Old Red, or Vorthak". A name already
 * known, within 2 edits of the one it renames (`spellingOf` proposes those), or opening with an article
 * (a role: "the Widow") is none. [provisional]
 */
export function renameCues(passage: string, entities: readonly Entity[]): Map<string, { name: string; of: string }> {
  const run = CAPITALISED.source;
  // By `norm`ed name.
  const out = new Map<string, { name: string; of: string }>();
  for (const e of entities) {
    for (const known of [e.name, ...e.aliases].filter((k) => k.trim())) {
      const k = escape(known);
      const after = new RegExp(String.raw`\b${k}\s*[,—–-]\s*${CUE},? (${run})`, 'gu');
      const before = new RegExp(String.raw`(${run}), ${CUE} ${k}\b`, 'gu');
      for (const [, name = ''] of [...passage.matchAll(after), ...passage.matchAll(before)]) {
        if (/^(?:the|a|an) /i.test(name) || matchEntity(entities, name) || editDistance(norm(name), norm(known)) <= 2) continue;
        if (!out.has(norm(name))) out.set(norm(name), { name, of: e.id });
      }
    }
  }
  return out;
}

type Proposal = { name: string; of: string; at: number };
type Pair = { name: string; of: string };

type Cues = ReturnType<typeof renameCues>;

/** Whether the player said No to `name` for entity `of`. */
const declined = (no: readonly Pair[] = [], name: string, of: string) => no.some((r) => r.of === of && norm(r.name) === norm(name));

/** The known entity a new name may be (its spelling, else the one a cue renames), unless the player said No to that pair. */
export const aliasOf = (entities: readonly Entity[], e: Pick<Entity, 'name' | 'kind'>, cues: Cues, no?: readonly Pair[]): Entity | undefined =>
  [spellingOf(entities, e.name, e.kind), entities.find((x) => x.id === cues.get(norm(e.name))?.of)].find((x) => x && !declined(no, e.name, x.id));

/** The alias proposals already asked and each cue not yet among them nor declined, from action `at`. */
export function withCues(state: { __aliasProposals?: Proposal[] | undefined; __aliasRejected?: Pair[] | undefined }, cues: Cues, at: number): Proposal[] {
  const { __aliasProposals: asked = [], __aliasRejected: no } = state;
  return [...asked, ...[...cues].flatMap(([n, c]) => (asked.some((p) => norm(p.name) === n) || declined(no, c.name, c.of) ? [] : [{ ...c, at }]))];
}
