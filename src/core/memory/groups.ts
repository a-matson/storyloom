import type { Entity } from '../model/types';

const NUMBERS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "The Harrows" → "Harrow": the word a member goes by. */
const stem = (n: string) =>
  escape(
    n
      .trim()
      .replace(/^the\s+/i, '')
      .replace(/s$/i, ''),
  );

/** How many of `faction` the passage counts ("three Harrow enforcers", "12 Harrows"); none counted: undefined. [provisional] */
export function groupCount(passage: string, faction: Pick<Entity, 'name' | 'aliases'>): number | undefined {
  const names = [faction.name, ...faction.aliases].map(stem).filter(Boolean);
  if (!names.length) return undefined;
  const m = new RegExp(`\\b(two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(?:\\w+\\s+){0,2}(?:${names.join('|')})s?\\b`, 'i').exec(passage);
  const n = m?.[1]?.toLowerCase();
  return n === undefined ? undefined : (NUMBERS[n] ?? Number(n));
}
