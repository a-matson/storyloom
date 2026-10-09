import type { Entity } from '@core/model';

// Pure, but in app beside its only user: a core `load*()` that only lazy code calls moves its
// `import()` into the lazy chunk, which split `preload-helper` out of the start-up chunk (+0.34 kB).

/** Facts that say what someone looks like; a word list, not a model call [provisional]. */
const APPEARANCE =
  /\b(hair|eyes?|beard|scar|tall|short|thin|stout|old|young|wears?|wearing|dressed|cloak|coat|robe|armou?r|skin|face|tattoo|freckles|bald|glasses|hat|hood)\b/i;

/** Text and frames are what SD 1.5 adds unasked to a portrait [provisional]. */
export const PORTRAIT_NEGATIVE = 'text, watermark, signature, frame, caption';

/** First matching tag wins, so all portraits of one adventure share a look [provisional]. */
const GENRE_STYLE: [RegExp, string][] = [
  [/fantasy|medieval|myth/i, 'oil painting, muted colours'],
  [/sci-?fi|space|cyberpunk|future/i, 'digital painting, cool lighting'],
  [/horror|gothic/i, 'dark charcoal drawing, low key light'],
  [/mystery|noir|detective/i, 'film noir, black and white photograph'],
];
const NEUTRAL_STYLE = 'painted illustration, soft light';

export function portraitStyle(tags: readonly string[]): string {
  return GENRE_STYLE.find(([re]) => tags.some((t) => re.test(t)))?.[1] ?? NEUTRAL_STYLE;
}

/** Looks first: SD 1.5 weighs the start of a prompt most. */
export function portraitPrompt(e: Pick<Entity, 'description' | 'appearance' | 'facts'>, style: string): string {
  const looks = e.facts
    .map((f) => f.text.trim())
    .filter((t) => APPEARANCE.test(t))
    .slice(0, 2);
  return ['portrait, head and shoulders', e.appearance?.trim(), e.description.trim(), ...looks, style.trim()].filter(Boolean).join(', ');
}
