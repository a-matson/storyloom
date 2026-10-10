import type { AdventureSettings } from '../model/types';

/** The default clause: fiction for an adult reader, nothing softened. Wording waits for the hand check. [provisional] */
export const CONTENT_UNRESTRICTED =
  'This is fiction for an adult reader. Depict violence, cruelty, sex, injury and dark themes directly and in detail when the story goes there; ' +
  "stay in the story's voice; never add warnings, disclaimers or moral commentary; never fade out or skip a scene unless the player does.";

/** For helper calls that only record the story (memory, summary, extraction, check, cards, image tags). [provisional] */
export const CONTENT_RECORD =
  'The story is adult fiction. Record violence, sex and dark events plainly and specifically; never soften, omit or comment on them.';

/** `story` for what the player reads, `record` for helper jobs. A blank custom text sends nothing. */
export function contentClause(s: Pick<AdventureSettings, 'content' | 'contentText'>, use: 'story' | 'record'): string {
  if (s.content === 'custom') return (s.contentText ?? '').trim();
  return use === 'story' ? CONTENT_UNRESTRICTED : CONTENT_RECORD;
}

export const withContent = (system: string, clause: string | undefined): string => (clause ? `${system}\n\n${clause}` : system);
