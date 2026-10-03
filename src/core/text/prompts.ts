/**
 * Utility prompts (summaries, memories, story cards, image prompts).
 * Kept in one place so they can be tuned without touching the engine.
 * These run on the "utility" provider when one is configured (a small
 * instruct model), otherwise on the story model between turns.
 */

export const MEMORY_SYSTEM =
  'You compress story passages into dense factual memories. Output only the memory: 1–3 sentences, past tense, ' +
  'proper names kept, no prose flourishes, no commentary, no headings.';

/** One original passage -> memory pair, so the model sees a summary rather than a continuation. [provisional] */
const MEMORY_EXAMPLE =
  'Example (from a different story):\n---\nThe ferryman names his price: a silver coin. "Or you swim," he says.\n> You give him the coin.\n' +
  'He pockets it and poles you across to Saltmarsh, where Captain Odo is waiting on the jetty.\n---\n' +
  'Memory: You paid the ferryman a silver coin to cross to Saltmarsh. Captain Odo was waiting there.\n\n';

export function memoryPrompt(passage: string): string {
  return `${MEMORY_EXAMPLE}Summarise the key facts, decisions, discoveries and relationship changes in this passage.\n\n---\n${passage}\n---\n\nMemory:`;
}

/**
 * GBNF (llama.cpp) for 1..max plain sentences: no dialogue, no `> You` lines, no newlines, and the
 * model can only end after a full stop. Mr./3.5 cannot be written; acceptable for summaries.
 */
export function sentenceGrammar(max: number): string {
  return `root ::= sentence{1,${max}}\nsentence ::= [^.!?"“”\\n> ] [^.!?"“”\\n>]* [.!?] " "?\n`;
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

/** Character Creator openings; used when the scenario has no AI Instructions. [provisional] */
export const OPENING_SYSTEM =
  'You are the narrator of an interactive story. Write in second person, present tense. Output only the story text: no title, no headings, no commentary.';

export function openingPrompt(opts: { brief: string; picks: { type: string; entry: string }[]; plotEssentials?: string | undefined }): string {
  return (
    'Write the opening scene of this interactive story.' +
    (opts.brief ? `\n\nScenario:\n${opts.brief}` : '') +
    (opts.picks.length ? `\n\nThe player's character:\n${opts.picks.map((p) => `- ${p.type}: ${p.entry}`).join('\n')}` : '') +
    (opts.plotEssentials ? `\n\nStory essentials:\n${opts.plotEssentials}` : '') +
    '\n\nWrite 2 short paragraphs in second person, present tense. End on a moment the player can act on. ' +
    'Never decide what the player does or says.'
  );
}

/** "Surprise me": an opening from nothing but a genre. Runs under OPENING_SYSTEM. [provisional] */
export function surprisePrompt(genre: string): string {
  return (
    `Invent the opening of a new ${genre} interactive story. Write 2–3 sentences in second person, present tense. ` +
    'Put the player in a concrete situation and end on a hook they can act on. Never decide what the player does or says.'
  );
}

export const CARD_SYSTEM = 'You write world-building notes for an interactive story. Reply with JSON only.';

/** One original card per type, so the model sees a description rather than a scene. [provisional] */
const CARD_EXAMPLES: Record<string, string> = {
  Character:
    '{"name": "Ilse Varn", "entry": "Ilse Varn is the harbourmaster of Coldwater. She is stern, counts every crate twice and hides a debt to the smugglers from the town council.", "triggers": ["ilse", "harbourmaster"]}',
  Class:
    '{"name": "Hedge Warden", "entry": "A Hedge Warden is a ranger sworn to keep one road safe. Wardens track by sign, set snares and carry a horn to call the nearest village.", "triggers": ["hedge warden", "warden"]}',
  Race: '{"name": "Marshfolk", "entry": "Marshfolk are a small, web-fingered people who live in stilt villages across the fens. They trade eels and reed paper and distrust stone buildings.", "triggers": ["marshfolk", "fens"]}',
  Location:
    '{"name": "The Sunken Market", "entry": "The Sunken Market is a bazaar in the flooded cellars beneath the old city. Stalls stand on planks above black water, and stolen goods sell without questions.", "triggers": ["sunken market", "bazaar"]}',
  Faction:
    '{"name": "The Grey Lanterns", "entry": "The Grey Lanterns are night watchmen who sell protection street by street. They answer to an elected captain and fine anyone out after curfew without their mark.", "triggers": ["grey lanterns", "watchmen"]}',
};
const CUSTOM_EXAMPLE =
  '{"name": "The Tithe Bell", "entry": "The Tithe Bell is a cracked bronze bell in the temple tower of Coldwater. It rings once each harvest to call farmers to pay the temple.", "triggers": ["tithe bell"]}';

export function cardPrompt(opts: {
  type: string;
  name?: string | undefined;
  instructions?: string | undefined;
  storyInfo?: string | undefined;
  summary?: string | undefined;
  plotEssentials?: string | undefined;
  recentStory?: string | undefined;
}): string {
  const grounded = !opts.name && `${opts.plotEssentials ?? ''}${opts.recentStory ?? ''}` !== '';
  return (
    (opts.plotEssentials ? `Story essentials:\n${opts.plotEssentials}\n\n` : '') +
    (opts.summary ? `Story so far:\n${opts.summary}\n\n` : '') +
    (opts.recentStory ? `Recent story:\n---\n${opts.recentStory}\n---\n\n` : '') +
    `Create a ${opts.type} story card for this story.` +
    (opts.name ? ` Its name is "${opts.name}".` : '') +
    (grounded ? ` Pick a ${opts.type.toLowerCase()} that appears in the text above and has a name there.` : '') +
    (opts.instructions ? `\nInstructions: ${opts.instructions}` : '') +
    (opts.storyInfo ? `\nStory information: ${opts.storyInfo}` : '') +
    '\n\nThe entry describes what it is, like an encyclopedia note: 2–4 plain present-tense sentences that mention the name, no events, no dialogue, nothing the player does. ' +
    'Triggers are 2–4 lower-case names or words from the story that refer to it.\n\n' +
    `Example ${opts.type} card (from a different story):\n${CARD_EXAMPLES[opts.type] ?? CUSTOM_EXAMPLE}\n\n` +
    'Return {"name": string, "entry": string, "triggers": string[]}.'
  );
}
