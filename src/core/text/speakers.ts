// Not in the text barrel: only the lazy memory jobs use it, and a barrel export splits the start-up chunk.
import type { Speaker } from '../model/types';
import { paragraphs } from './formatting';

interface Named {
  name: string;
  aliases: readonly string[];
}

const QUOTE = /"[^"]*"|“[^”]*”/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
/** Second-person stories: `you say, "…"` / `"…," you say` is the player, so it ties with any name instead of losing to it. "toward you" is not. */
const PLAYER = { name: '', re: /(?<!\p{L})you \p{L}+,?\s*§|§\s*,?\s*you(?!\p{L})/iu };

/**
 * A known name or alias right before a quote (same sentence, or the sentence just before it) or
 * right after one ("…," said X). Quotes are blanked first so a name inside one never counts.
 * A paragraph gets a name only when exactly one entity matches; ties, the player and unknowns get
 * nothing, except that `fallback` names a quoted paragraph where nobody matches. [provisional]
 */
export function guessSpeakers(text: string, cast: readonly Named[], fallback?: string): Speaker[] {
  const tests = cast.flatMap((c) => {
    const n = [c.name, ...c.aliases]
      .filter((s) => s.trim())
      .map(escape)
      .join('|');
    if (!n) return [];
    return { name: c.name, re: new RegExp(`(?<!\\p{L})(?:${n})(?!\\p{L})[^.!?§]*[.!?]?\\s*§|§\\s*,?\\s*(?:\\p{L}+\\s+)?(?:${n})(?!\\p{L})`, 'iu') };
  });
  tests.push(PLAYER);
  return paragraphs(text).flatMap((p, paragraph) => {
    const bare = p.replace(QUOTE, '§');
    if (bare === p) return [];
    const hits = tests.filter((t) => t.re.test(bare));
    const name = hits.length === 1 ? hits[0]?.name : hits.length === 0 ? fallback : undefined;
    return name ? [{ paragraph, name }] : [];
  });
}
