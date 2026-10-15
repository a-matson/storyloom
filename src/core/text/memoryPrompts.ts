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

export const SUMMARY_SYSTEM =
  'You maintain a running summary of an interactive story. Extend the summary with the new memories; ' +
  'keep every earlier event; do not drop details. Keep it information-dense and chronological, in two parts: ' +
  '"Long ago:" (at most 6 sentences) then "Recently:" (at most 6 sentences). When Recently would pass 6 sentences, ' +
  'fold its oldest sentences into Long ago. Output only the summary.';

/** Sent only when a memory or the summary carries a secret's mark, so other summaries keep their measured prompt. [provisional] */
const KEEP_MARKS = 'Keep each "(known only to …)" mark as written, with the fact it marks.\n\n';

export function summaryPrompt(previousSummary: string, newMemories: string[], given: readonly string[] = []): string {
  const marked = [previousSummary, ...newMemories].some((t) => t.includes('(known only to '));
  return (
    givenBlock(given) +
    (previousSummary ? `Current summary:\n${previousSummary}\n\n` : '') +
    (newMemories.length ? `New memories since then:\n${newMemories.map((m) => `- ${m}`).join('\n')}\n\n` : '') +
    (marked ? KEEP_MARKS : '') +
    'Write the updated summary:'
  );
}
