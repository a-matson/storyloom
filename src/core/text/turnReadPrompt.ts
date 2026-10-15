import { LOOKS_ASK, ONE_LINE } from './prompts';

// Not re-exported from `./index`: only the lazy memory jobs build it, so its wording stays off the start-up bundle.

/** Opens the turn read's prompt; the demo backend answers by it. */
export const TURN_READ_ASK = 'Where does the passage end, and who is there?';

/** The scene before the passage, as the turn read is told it. */
export interface PrevScene {
  location?: string | undefined;
  present: readonly string[];
}

/**
 * The turn read: the scene, then a card for each new name when there are any, so it ends while the player reads.
 * The scene wording is probe P7c's: present 27/30, place 27/30. [measured: 2026-10-13-state-probe-m12-dogfood]
 */
export function introducePrompt(passage: string, newNames: readonly string[], grammar: boolean, prev: PrevScene, cast: readonly string[]): string {
  const cards = newNames.length > 0;
  return (
    TURN_READ_ASK +
    (cards ? ` New here: ${newNames.join(', ')}.` : '') +
    // No placeholder place: one the model could copy back as the location.
    `\nPrevious scene: ${prev.location ? `location "${prev.location}", present: ${prev.present.join(', ') || 'nobody'}` : 'not known yet'}. Known characters: ${cast.join(', ') || 'none yet'}.` +
    `\n\n---\n${passage}\n---\n\n` +
    // "You", not "the characters": with them, the location followed two characters sent to the basement (M14-S2 replay).
    'scene is where the passage ends. location is where you are at the end, in at most four words (keep the previous wording when it is the same place). ' +
    'present lists the known characters there at the end (asleep or unconscious still counts; gone to another room does not), not the player "you". ' +
    (prev.present.length
      ? 'stay gives each character present in the previous scene: "here" if still in the same room as you at the end, ' +
        '"left" if they went to another room or away (climbing down, going upstairs or outside counts), "asleep" if asleep or unconscious there. '
      : '') +
    'weather is "unchanged" unless the passage states the weather, and "none" when the scene moved indoors. ' +
    (cards
      ? 'For each new name that is a proper name of a character, place, item or faction in this passage, give its kind and a one-sentence description of who or what it is. ' +
        `Skip a name that is not one (a common word, an exclamation, the player "you"). ${LOOKS_ASK}\n`
      : '\n') +
    (grammar
      ? `Return {"scene": {...}${cards ? ', "entities": [...]' : ''}}.`
      : 'Return JSON in this shape (<...> are placeholders):\n{"scene": {"location": "<place>", "present": ["<Name>"], "stay": {' +
        prev.present.map((n) => `"${n}": "<here|left|asleep>"`).join(', ') +
        '}, "weather": "unchanged"}' +
        (cards ? ', "entities": [{"name": "<Name>", "kind": "character", "description": "<one sentence>", "looks": {"<key>": "<a few words>"}}]' : '') +
        '}') +
    ONE_LINE
  );
}
