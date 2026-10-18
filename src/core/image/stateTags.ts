import type { SheetFamily } from './sheet';
import { tags } from './tags';

/** How a stored state value reads as picture tags; a value not here passes through as one tag. [provisional] */
const STATE_TAGS: Record<string, Readonly<Record<string, string>>> = {
  posture: { lying: 'lying, on side', sitting: 'sitting', kneeling: 'kneeling', standing: 'standing', prone: 'lying, on stomach', crouching: 'crouching' },
  condition: { asleep: 'sleeping, eyes closed', unconscious: 'unconscious, eyes closed', hurt: 'wounded, blood', wounded: 'wounded, blood', drunk: 'blush' },
};

// A brief that says how someone stands or looks wins over the stored one. [provisional]
const POSTURE_WORDS =
  /\b(?:stand(?:s|ing)?|stood|sit(?:s|ting)?|sat|seated|lie|lies|lying|lay|kneel(?:s|ing)?|knelt|crouch(?:es|ing)?|run(?:s|ning)?|ran|walk(?:s|ing)?|prone)\b/i;
const EXPRESSION_WORDS = /\b(?:smil\w*|grin\w*|frown\w*|scowl\w*|laugh\w*|cry|cries|crying|tears?|sob\w*|pout\w*|sneer\w*|expression)\b/i;

const lookup = (key: string, value: string) => STATE_TAGS[key]?.[value.trim().toLowerCase()] ?? value;
const mood = (value: string, family: SheetFamily) => (family === 'sdxl' && !/expression/i.test(value) ? `${value} expression` : value);

/** One character's posture, condition, mood and what they hold (`held`, as nouns) as tags, less what `brief` already says. */
export function stateTags(states: Readonly<Record<string, string>>, held: readonly string[], family: SheetFamily, brief: string): string {
  const say = (key: string) => states[key]?.trim() ?? '';
  return tags([
    POSTURE_WORDS.test(brief) || !say('posture') ? '' : lookup('posture', say('posture')),
    say('condition') && lookup('condition', say('condition')),
    EXPRESSION_WORDS.test(brief) || !say('mood') ? '' : mood(say('mood'), family),
    ...held.map((h) => `holding ${h}`),
  ]);
}
