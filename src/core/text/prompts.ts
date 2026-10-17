/**
 * Utility prompts (summaries, memories, story cards, image prompts).
 * Kept in one place so they can be tuned without touching the engine.
 * These run on the "utility" provider when one is configured (a small
 * instruct model), otherwise on the story model between turns.
 */

import { LOOK_KEYS } from '../memory/looks';

/**
 * GBNF (llama.cpp) for 1..max plain sentences: no dialogue, no `> You` lines, no newlines, and the
 * model can only end after a full stop. Mr./3.5 cannot be written; acceptable for summaries.
 */
export function sentenceGrammar(max: number): string {
  return `root ::= sentence{1,${max}}\nsentence ::= [^.!?"“”\\n> ] [^.!?"“”\\n>]* [.!?] " "?\n`;
}

export const EXTRACT_SYSTEM = 'You keep a record of the people, places, items and factions in an interactive story. Reply with JSON only.';

/**
 * The reply's shape when no grammar carries it. Placeholders, not a worked example: the 12B copied
 * the example's names into the record (#116). [provisional]
 */
const EXTRACT_SKELETON =
  'Return JSON in this shape (<...> are placeholders):\n' +
  '{"entities": [{"name": "<Name>", "kind": "character", "aliases": ["<role>"], "description": "<one sentence>",\n' +
  '   "facts": ["<fact>"], "looks": {"<key>": "<a few words>"}, "relationships": [{"to": "<Name>", "stance": "<a few words>"}]},\n' +
  '  {"name": "<Name>", "kind": "place", "description": "<one sentence>", "facts": []}]}';
const EXTRACT_SKELETON_ROLES = `${EXTRACT_SKELETON.slice(0, -1)},\n "refersTo": {"<Name>": "the <role>"}}`;

/**
 * llama-server's schema grammar allows newlines and indentation; pretty-printed, 3 of 8 entity
 * replies ran into the 500-token cap, with this line 0 of 8 (~330 tokens). [measured: M12-1 PR 4 probe, 2026-10-11]
 */
export const ONE_LINE = ' Write the JSON on one line, with no line breaks or indentation.';

export const LOOKS_ASK = `looks is only for characters: a few words for each of ${LOOK_KEYS.join(', ')} that the passage shows; leave out the rest, and leave it out for places, items and factions.`;
/**
 * After the passage: before it, as the cached prefix would have it, the 12B left `refersTo` empty. Without "never the
 * name itself" it wrote each name back in 2 of 2 calls of one run. Example names no dogfood holds, so a replay is not
 * primed. [measured: 2026-10-17-batch-m18-2-roles.json, -roles-d-r2.json]
 */
const REFERS_ASK =
  'refersTo: for each name it lists, one short noun phrase the passage calls that character by in place of the name ("the gnome" for a gnome called Tib, "the old sailor"), or "" if none; never the name itself or a pronoun.\n';
/**
 * The combined call. No cards of the known names and no list of new ones: with both, the 12B
 * proposed 10 facts at d30 where the bare prompt's reply kept 15. [measured: 2026-10-11-recall-m12-1-pr2-log-d30.json]
 * `grammar`: the reply is constrained by `extractionJson`, which already carries the shape. `roles`: the reply has `refersTo`.
 */
export function extractPrompt(passage: string, knownNames: readonly string[], grammar: boolean, roles = false): string {
  return (
    'List every named character, place, item and faction in this passage, with what it tells about each. ' +
    'Only things with a proper name; skip common nouns like "the path" or "wolves". An unnamed role ("the ferrywoman") is an alias of the named person it refers to.' +
    `\n\n---\n${passage}\n---\n\n` +
    (knownNames.length ? `Already recorded (use these exact names when the passage means them): ${knownNames.join(', ')}.\n` : '') +
    'Give each entity a one-sentence description and 0–2 facts: short sentences about what lasts (who or what it is, what it owns, injuries, loyalties), not single actions or dialogue, and nothing the passage does not state. ' +
    `${LOOKS_ASK} relationships: 0–2, to whom (a Name, or "You" for the player) and the stance in a few words. ` +
    'No location, posture, condition or mood: those are read each turn. ' +
    'The player is "you", not an entity.\n' +
    (roles ? REFERS_ASK : '') +
    (grammar ? `Return {"entities": [...]${roles ? ', "refersTo": {...}' : ''}}.` : roles ? EXTRACT_SKELETON_ROLES : EXTRACT_SKELETON) +
    ONE_LINE
  );
}

export const CHECK_SYSTEM = 'You check an interactive story for continuity errors. Reply with JSON only.';

export function checkPrompt(output: string, lines: readonly string[]): string {
  return (
    `Established facts:\n${lines.map((l) => `- ${l}`).join('\n')}\n\nNew passage:\n---\n${output}\n---\n\n` +
    'Does the new passage state something that cannot be true if one of the facts is true? ' +
    'Moving to another place, time passing, new people and details the facts do not mention are not contradictions; ' +
    'only a direct clash is (long braids on a shaved head, one moon where there are two). ' +
    'Return {"contradicts": boolean, "fact": string}: fact is the fact it breaks, copied exactly, or "" when it breaks none.'
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
  /** Names that already have a card; the model is told to pick another subject. */
  existing?: string[] | undefined;
}): string {
  const grounded = !opts.name && `${opts.plotEssentials ?? ''}${opts.recentStory ?? ''}` !== '';
  const existing = opts.name ? [] : (opts.existing ?? []).filter((n) => n.trim() !== '');
  return (
    (opts.plotEssentials ? `Story essentials:\n${opts.plotEssentials}\n\n` : '') +
    (opts.summary ? `Story so far:\n${opts.summary}\n\n` : '') +
    (opts.recentStory ? `Recent story:\n---\n${opts.recentStory}\n---\n\n` : '') +
    `Create a ${opts.type} story card for this story.` +
    (opts.name ? ` Its name is "${opts.name}".` : '') +
    (grounded ? ` Pick a ${opts.type.toLowerCase()} that appears in the text above and has a name there.` : '') +
    (existing.length > 0 ? ` These already have a card, so pick a different subject: ${existing.join(', ')}.` : '') +
    (opts.instructions ? `\nInstructions: ${opts.instructions}` : '') +
    (opts.storyInfo ? `\nStory information: ${opts.storyInfo}` : '') +
    '\n\nThe entry describes what it is, like an encyclopedia note: 2–4 plain present-tense sentences that mention the name, no events, no dialogue, nothing the player does. ' +
    'Triggers are 2–4 lower-case names or words from the story that refer to it.\n\n' +
    `Example ${opts.type} card (from a different story):\n${CARD_EXAMPLES[opts.type] ?? CUSTOM_EXAMPLE}\n\n` +
    'Return {"name": string, "entry": string, "triggers": string[]}.'
  );
}
