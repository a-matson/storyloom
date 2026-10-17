// Memory and summary prompts. Their own module because only the lazy memory jobs import them; in
// `prompts.ts` they rode the start-up chunk with the card prompts.

export const MEMORY_SYSTEM =
  'You compress story passages into dense factual memories. Output only the memory: 1–4 sentences, past tense, ' +
  'proper names kept, no prose flourishes, no commentary, no headings.';

/**
 * A format line, not a worked example: the example's names leaked into 5-7 of 16 memories and the guard
 * against that dropped real facts. [measured: 2026-10-08-memory-keep-after]
 * The "never say" clause: without it a dogfood range gave the player a body and a dress they never had
 * (5/5 invented, 0/5 with it); memory-keep 14 and 10/16 against main's 13. [measured: 2026-10-14-memory-replay-28-33-m13-7]
 * The "> You" clause: `> You say "Minos, …"` read as Minos speaking ("Minos's confession") in 3/10, 3/20 with it;
 * memory-keep 11 and 10 against main's 11. [measured: 2026-10-15-memory-replay-47-53-s3-after3]
 */
const MEMORY_FORMAT =
  'Format: 1–4 past-tense sentences. First, anything the player states about themselves (name, body, belongings, past), if they state anything; ' +
  'never say what the player is or looks like unless the passage does. ' +
  'Lines starting "> You" are the player\'s: what is said or done there is yours, kept as "you", even when the line opens with a name. ' +
  'Then the facts, decisions, discoveries and relationship changes, with every proper name kept. ' +
  'No dialogue, no prose, no commentary.\n\n';

/** What the player wrote about themselves, so a helper need not invent it (the summary did). Empty: no block. */
const givenBlock = (given: readonly string[]) => (given.length ? `Given about the player:\n${given.map((g) => `- ${g}`).join('\n')}\n\n` : '');

export function memoryPrompt(passage: string, given: readonly string[] = []): string {
  return `${MEMORY_FORMAT}${givenBlock(given)}Summarise this passage.\n\n---\n${passage}\n---\n\nMemory:`;
}

/**
 * The model writes the summary's parts from new text only; `refreshSummary` assembles them. Given its whole old summary
 * to extend under a 12-sentence grammar, it copied it 10 of 10 times (35 of 35 in the M17 dogfood); told to write
 * "Recently" first, it wrote only the new memories and dropped the past. [measured: 2026-10-17-summary-m19-5-before, -a]
 */
export const SUMMARY_SYSTEM =
  'You summarise an interactive story. Output only the summary: information-dense, past tense, chronological, ' +
  'every proper name kept, no dialogue, no commentary.';

/** Sent only when a memory or the summary carries a secret's mark, so other summaries keep their measured prompt. [provisional] */
const KEEP_MARKS = 'Keep each "(known only to …)" mark as written, with the fact it marks.\n\n';

const marksIn = (texts: readonly string[]) => (texts.some((t) => t.includes('(known only to ')) ? KEEP_MARKS : '');
const listed = (title: string, lines: readonly string[]) => (lines.length ? `${title}\n${lines.map((l) => `- ${l}`).join('\n')}\n\n` : '');

/** The summary's "Recently": the memories of newly evicted text, and the events the batch read stored there. */
export function summaryPrompt(newMemories: readonly string[], events: readonly string[] = [], given: readonly string[] = []): string {
  return (
    givenBlock(given) +
    listed('Events since the last summary:', events) +
    listed('New memories:', newMemories) +
    marksIn([...events, ...newMemories]) +
    'Write what happened, in at most 6 sentences:'
  );
}

/** The old "Recently", retold short for "Long ago". */
export function eraPrompt(recently: string): string {
  return (
    `Story:\n${recently}\n\n${marksIn([recently])}` +
    'Retell this in at most 3 sentences. Keep who met whom and where, deaths, promises, betrayals and discoveries:'
  );
}
