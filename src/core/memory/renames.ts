import type { Entity } from '../model/types';
import { matchEntity, norm } from './names';
import { editDistance } from './spelling';

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

/** The alias proposals `asked` and each cue not yet among them, from action `at`. */
export const withCues = (asked: readonly Proposal[], cues: ReturnType<typeof renameCues>, at: number): Proposal[] => [
  ...asked,
  ...[...cues].flatMap(([n, c]) => (asked.some((p) => norm(p.name) === n) ? [] : [{ ...c, at }])),
];
