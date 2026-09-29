/**
 * `${placeholder}` substitution for scenarios.
 *
 * Rules (AI Dungeon compatible):
 *  - `${Any question text}` becomes a pre-play form field; the answer replaces
 *    every occurrence of the identical (case-sensitive) placeholder;
 *  - `${character.name}` is special: its label is "Enter your character's name…";
 *  - placeholders may appear in the prompt, plot components and story cards
 *    (entry, triggers, notes) but not in a card's Type field.
 */

export const CHARACTER_NAME = 'character.name';
const RE = /\$\{([^}]+)\}/g;

export interface PlaceholderQuestion {
  key: string;
  label: string;
}

export function findPlaceholders(texts: (string | undefined)[]): PlaceholderQuestion[] {
  const seen = new Set<string>();
  const out: PlaceholderQuestion[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(RE)) {
      const key = m[1] ?? '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: key === CHARACTER_NAME ? "Enter your character's name…" : key });
    }
  }
  return out;
}

export function applyPlaceholders(text: string, answers: Record<string, string>): string {
  return text.replace(RE, (whole, key: string) => (key in answers ? answers[key] ?? '' : whole));
}

export function hasPlaceholders(text: string | undefined): boolean {
  return !!text && /\$\{[^}]+\}/.test(text);
}
