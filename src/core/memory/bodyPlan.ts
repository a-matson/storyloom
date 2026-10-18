import type { Adventure, Assertion, Entity } from '../model/types';
import { actionText } from '../model/types';
import { indexAssertions } from './assertionIndex';
import { byPlayer, currentStates, valueOf } from './looks';
import type { MemoryRange } from './memoryBank';

/** Body-plan words and the tag each stands for. [provisional] */
const BODY_WORDS: Record<string, string> = {
  feral: 'feral',
  quadruped: 'quadruped',
  quadrupedal: 'quadruped',
  anthro: 'anthro',
  anthropomorphic: 'anthro',
  taur: 'taur',
  biped: 'biped',
  bipedal: 'biped',
  humanoid: 'humanoid',
  serpentine: 'serpentine',
  naga: 'naga',
};
/** Body parts an identity can name that a picture must show; a singular reads as its word. [provisional] */
export const VISIBLE_WORDS = ['wings', 'horns', 'tail', 'claws', 'fangs', 'mane', 'fur', 'feathers', 'hooves', 'tusks', 'antlers'] as const;

const BODY = new RegExp(`\\b(${Object.keys(BODY_WORDS).join('|')})\\b`, 'i');
const VISIBLE = new RegExp(`\\b(wings?|horns?|tails?|claws?|fangs?|manes?|fur|feathers?|hoof|hooves|tusks?|antlers?)\\b`, 'gi');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The body word in a sentence that names the entity, as its tag. */
export function bodyFromLine(text: string, e: Pick<Entity, 'name' | 'aliases'>): string | undefined {
  const names = [e.name, ...e.aliases].filter((n) => n.trim() !== '').map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.trim())}(?![\\p{L}\\p{N}])`, 'iu'));
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const word = sentence.match(BODY)?.[1];
    if (word && names.some((re) => re.test(sentence))) return BODY_WORDS[word.toLowerCase()];
  }
  return undefined;
}

/** The `VISIBLE_WORDS` the identity names, deduped, in text order. */
export const visibleFrom = (identity: string): string[] => [
  ...new Set(
    [...identity.matchAll(VISIBLE)].map(([m]) => {
      const w = m.toLowerCase() === 'hoof' ? 'hooves' : m.toLowerCase();
      return VISIBLE_WORDS.find((v) => v === w || v === `${w}s` || `${v}s` === w) ?? w;
    }),
  ),
];

const PLAYER = new Set(['start', 'do', 'say', 'story']);

/** A character the player's lines of `range` give a body plan, with none yet, gets it as the player's look. Returns how many. */
export function bodiesFromPlayer(adventure: Adventure, range: MemoryRange): number {
  const ix = indexAssertions(adventure.assertions);
  const added: Assertion[] = [];
  for (const e of adventure.entities) {
    if (e.kind !== 'character' || currentStates(ix.of(e.id))['body']) continue;
    for (let at = range.fromAction; at < range.toAction; at++) {
      const a = adventure.actions[at];
      const body = a && PLAYER.has(a.type) ? bodyFromLine(actionText(a), e) : undefined;
      if (body) {
        added.push(byPlayer(e.id, at, valueOf('body', body)));
        break;
      }
    }
  }
  adventure.assertions = [...adventure.assertions, ...added];
  return added.length;
}
