/**
 * Utility prompts (summaries, memories, story cards, image prompts).
 * Kept in one place so they can be tuned without touching the engine.
 * These run on the "utility" provider when one is configured (a small
 * instruct model), otherwise on the story model between turns.
 */

export const MEMORY_SYSTEM =
  'You compress story passages into dense factual memories. Output only the memory: 1–3 sentences, past tense, ' +
  'proper names kept, no prose flourishes, no commentary, no headings.';

export function memoryPrompt(passage: string): string {
  return `Summarise the key facts, decisions, discoveries and relationship changes in this passage.\n\n---\n${passage}\n---\n\nMemory:`;
}

export const SUMMARY_SYSTEM =
  'You maintain a running summary of an interactive story. Keep it information-dense and chronological, ' +
  'under 250 words, dropping details that no longer matter. Output only the summary.';

export function summaryPrompt(previousSummary: string, newMemories: string[], recentPassage: string): string {
  return (
    (previousSummary ? `Current summary:\n${previousSummary}\n\n` : '') +
    (newMemories.length ? `New memories since then:\n${newMemories.map((m) => `- ${m}`).join('\n')}\n\n` : '') +
    (recentPassage ? `Most recent passage:\n${recentPassage}\n\n` : '') +
    'Write the updated summary:'
  );
}

export const CARD_SYSTEM = 'You write world-building notes for an interactive story. Reply with JSON only.';

export function cardPrompt(opts: {
  type: string;
  name?: string | undefined;
  instructions?: string | undefined;
  storyInfo?: string | undefined;
  summary?: string | undefined;
}): string {
  return (
    `Create a ${opts.type} story card.` +
    (opts.name ? ` Its name is "${opts.name}".` : '') +
    (opts.instructions ? `\nInstructions: ${opts.instructions}` : '') +
    (opts.storyInfo ? `\nStory information: ${opts.storyInfo}` : '') +
    (opts.summary ? `\nStory so far: ${opts.summary}` : '') +
    '\n\nReturn {"name": string, "entry": string (2–4 plain sentences that mention the name), "triggers": string[] (3–6 lower-case keywords)}.'
  );
}
