/** Words per token for English prose; the line asks for a little less than the token cap. [provisional] */
const WORDS_PER_TOKEN = 0.72;

/** Share of the hinted length an action scene asks for; max tokens stay. [provisional] */
export const ACTION_LENGTH = 0.6;

/** The reply-length line for the Author's note: `Replies run about 140 words in 2 paragraphs.` */
export function lengthLine(tokens: number, tension?: string): string {
  const responseLength = tension === 'action' ? tokens * ACTION_LENGTH : tokens;
  const words = Math.max(10, Math.round((responseLength * WORDS_PER_TOKEN) / 10) * 10);
  const paragraphs = responseLength <= 120 ? 1 : responseLength <= 260 ? 2 : 3;
  return `Replies run about ${words} words in ${paragraphs} paragraph${paragraphs === 1 ? '' : 's'}.`;
}
