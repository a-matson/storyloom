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
  /** Occurrences across all texts; the player is still asked once. */
  uses: number;
}

export function findPlaceholders(texts: (string | undefined)[]): PlaceholderQuestion[] {
  const seen = new Map<string, PlaceholderQuestion>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(RE)) {
      const key = m[1] ?? '';
      if (!key) continue;
      const q = seen.get(key);
      if (q) q.uses++;
      else seen.set(key, { key, label: key === CHARACTER_NAME ? "Enter your character's name…" : key, uses: 1 });
    }
  }
  return [...seen.values()];
}

export function applyPlaceholders(text: string, answers: Record<string, string>): string {
  return text.replace(RE, (whole, key: string) => (key in answers ? (answers[key] ?? '') : whole));
}
