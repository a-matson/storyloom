import type { Assertion } from '../model/types';
import { isCurrent, type AssertionOf } from './assertionIndex';

/** Where a stance has moved since it was read: trust and fear, each −2…+2. */
export interface Standing {
  trust: number;
  fear: number;
  /** The `at` of the event that put the stance at its word. */
  crossedAt?: number;
}

/**
 * What an event does to the receiver's trust and fear in its actor, by its words. Inflected forms anywhere, the bare
 * verb only after an opening "You": "asks you for help" is no help. [provisional]
 */
const MOVES: readonly { re: RegExp; bare: RegExp; trust: number; fear: number }[] = [
  {
    re: /\b(?:rescue[sd]|rescuing|save[sd]|saving|heal(?:s|ed|ing)|help(?:s|ed|ing)|protect(?:s|ed|ing)|free[sd]|freeing)\b/i,
    bare: /^you (?:rescue|save|heal|help|protect|free)\b/i,
    trust: 1,
    fear: 0,
  },
  { re: /\b(?:gift(?:s|ed)|shares|shared|sharing)\b/i, bare: /^you (?:gift|share)\b/i, trust: 1, fear: 0 },
  {
    re: /\b(?:betray(?:s|ed|ing)|li(?:es|ed|ing) to|abandon(?:s|ed|ing)|steal(?:s|ing)? from|stole from|deceiv(?:es|ed|ing))\b/i,
    bare: /^you (?:betray|lie to|abandon|deceive|steal from)\b/i,
    trust: -1,
    fear: 0,
  },
  {
    re: /\b(?:threaten(?:s|ed|ing)|attack(?:s|ed|ing)|hit(?:s|ting)?|wound(?:s|ed|ing)|stab(?:s|bed|bing)|strikes|struck)\b/i,
    bare: /^you (?:threaten|attack|wound|stab|strike)\b/i,
    trust: -1,
    fear: 1,
  },
];
const moves = (text: string) => MOVES.filter((m) => m.re.test(text) || m.bare.test(text));
/** How far a counter goes; at it, the stance word swaps. [provisional] */
export const STANDING_MAX = 2;

const clamp = (n: number) => Math.max(-STANDING_MAX, Math.min(STANDING_MAX, n));
const word = (s: Pick<Standing, 'trust' | 'fear'>) =>
  s.fear === STANDING_MAX ? 'fears' : s.trust === STANDING_MAX ? 'trusts' : s.trust === -STANDING_MAX ? 'distrusts' : undefined;

/**
 * The relationship's subject's standing toward `from` (`to`'s entity id, or `you`), over the current events
 * since it was read where `from` acted (`who[0]`) on the subject: "Tamsin rescued you" moves your trust in her,
 * not hers in you. Derived each time, never stored: an edit that drops an event un-moves it. One the player wrote stays put.
 */
export function standing(rel: AssertionOf<'relationship'>, events: readonly Assertion[], from: string): Standing {
  const s: Standing = { trust: 0, fear: 0 };
  if (rel.basis === 'player') return s;
  const on = events
    .filter(
      (a): a is AssertionOf<'event'> => a.kind === 'event' && isCurrent(a) && a.at >= rel.since && a.who[0] === from && a.who.slice(1).includes(rel.subject),
    )
    .toSorted((a, b) => a.at - b.at);
  for (const e of on) {
    const was = word(s);
    for (const m of moves(e.text.trim())) {
      s.trust = clamp(s.trust + m.trust);
      s.fear = clamp(s.fear + m.fear);
    }
    const now = word(s);
    if (!now) delete s.crossedAt;
    else if (now !== was) s.crossedAt = e.at;
  }
  return s;
}

/** The word a crossed stance is sent as (fear wins), with `whom` ("trusts you"), else the stored stance. */
export function stanceWord(rel: AssertionOf<'relationship'>, s: Standing, whom = ''): string {
  const w = word(s);
  return w ? `${w} ${whom}`.trim() : rel.stance;
}
