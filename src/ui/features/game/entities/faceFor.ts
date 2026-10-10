import type { Entity } from '@core/model';

const QUOTE = /"[^"]*"|“[^”]*”/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const names = (e: Entity) => [e.name, ...e.aliases].filter((n) => n.trim());
const one = <T>(xs: readonly T[]) => (xs.length === 1 ? xs[0] : undefined);

/**
 * The face beside one output paragraph, or none: never a wrong face. The speaker label wins; else
 * the one character the narration names (quotes blanked, so a name called out in dialogue is not
 * the speaker); else, when `present` is given (a reply to a `say`), the one character in the scene.
 * Two or more candidates → none. [provisional]
 */
export function faceFor(paragraph: string, label: string | undefined, cast: readonly Entity[], present?: readonly string[]): Entity | undefined {
  if (label !== undefined) return cast.find((c) => c.name === label || c.aliases.includes(label));
  const chars = cast.filter((c) => c.kind === 'character');
  const bare = paragraph.replace(QUOTE, ' ');
  const named = chars.filter((c) => names(c).some((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'iu').test(bare)));
  if (named.length > 0 || present === undefined) return one(named);
  const here = new Set(present.map((p) => p.toLowerCase()));
  return one(chars.filter((c) => names(c).some((n) => here.has(n.toLowerCase()))));
}
