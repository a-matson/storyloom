import { LOOKS_ASK, ONE_LINE } from './prompts';
import { STATE_ASK, stateRecords, type StateRecord } from './statePrompt';

// Not re-exported from `./index`: only the lazy memory jobs build it, so its wording stays off the start-up bundle.

/** Opens the turn read's prompt; the demo backend answers by it. */
export const TURN_READ_ASK = 'Where does the passage end, and who is there?';

/** The scene before the passage, as the turn read is told it. */
export interface PrevScene {
  location?: string | undefined;
  present: readonly string[];
  zones?: Readonly<Record<string, string>> | undefined;
  /** Your room in `location`: told as the location, so the read keeps its wording while you stay (M22-3). */
  zone?: string | undefined;
  /** Factions `present` may list as a group; not in the previous scene's `present`, so no `stay` for them. */
  factions?: readonly string[];
}

/** `; in the basement: Vorthak, Weever` per room, so a read keeps who is in one there instead of losing them. */
const roomsOf = (zones: PrevScene['zones']) => {
  const by = new Map<string, string[]>();
  for (const [n, room] of Object.entries(zones ?? {})) by.set(room, [...(by.get(room) ?? []), n]);
  return [...by].map(([room, who]) => `; in ${room}: ${who.join(', ')}`).join('');
};

/**
 * The turn read: the scene, then a card for each new name when there are any, so it ends while the player reads.
 * The scene wording is probe P7c's: present 27/30, place 27/30. [measured: 2026-10-13-state-probe-m12-dogfood]
 * The ask comes before the passage and the names, so slot 1 reuses it from its prompt cache (M17-2).
 */
export function introducePrompt(
  passage: string,
  newNames: readonly string[],
  grammar: boolean,
  prev: PrevScene,
  cast: readonly string[],
  // Read B merged in (M17-1): its ask first, as its `changes` lead the reply (after the scene's ask, it got 6 entries
  // in 30 turns, first 45) [measured: 2026-10-16-state-m17-1-m12-ab.json, -m12-ab6.json]; the records after the previous scene, the cap after the passage.
  state?: { records: readonly StateRecord[]; max: number },
): string {
  const cards = newNames.length > 0;
  const factions = prev.factions ?? [];
  return (
    (state ? `changes: ${STATE_ASK}\n` : '') +
    TURN_READ_ASK +
    // "You", not "the characters": with them, the location followed two characters sent to the basement (M14-S2 replay).
    '\nscene is where the passage ends. location is where you are at the end, in at most four words (keep the previous wording when it is the same place). ' +
    'present lists the known characters there at the end (asleep or unconscious still counts; gone to another room does not), not the player "you". ' +
    (factions.length ? 'A faction listed in present means members of it are there. ' : '') +
    (prev.present.length
      ? 'stay gives each character present in the previous scene: "here" if still in the same room as you at the end, ' +
        '{"room": "<the room>"} if they went to another room of this place (climbing down to the basement, going upstairs), ' +
        '"left" if they went away (outside, another place), "asleep" if asleep or unconscious there. '
      : '') +
    'weather is "unchanged" unless the passage states the weather, and "none" when the scene moved indoors. ' +
    (cards
      ? 'For each new name that is a proper name of a character, place, item or faction in this passage, give its kind and a one-sentence description of who or what it is. ' +
        `Skip a name that is not one (a common word, an exclamation, the player "you"). ${LOOKS_ASK}\n`
      : '\n') +
    (cards ? `New here: ${newNames.join(', ')}.\n` : '') +
    // No placeholder place: one the model could copy back as the location.
    `Previous scene: ${prev.location ? `location "${prev.zone ?? prev.location}", present: ${prev.present.join(', ') || 'nobody'}${roomsOf(prev.zones)}` : 'not known yet'}. Known characters: ${cast.join(', ') || 'none yet'}.` +
    (factions.length ? ` Known factions: ${factions.join(', ')}.` : '') +
    (state ? `\n\n${stateRecords(state.records)}` : '') +
    `\n\n---\n${passage}\n---\n\n` +
    (state ? `changes: for each one in the records above, each posture, condition, mood, wearing or holds this passage changes; at most ${state.max}.\n` : '') +
    (grammar
      ? `Return {${state ? '"changes": [...], ' : ''}"scene": {...}${cards ? ', "entities": [...]' : ''}}.`
      : 'Return JSON in this shape (<...> are placeholders):\n{' +
        (state ? '"changes": [{"who": "<Name>", "key": "<key>", "now": "<new value>", "at": <number>}], ' : '') +
        '"scene": {"location": "<place>", "present": ["<Name>"], "stay": {' +
        prev.present.map((n) => `"${n}": "<here|left|asleep>" or {"room": "<the room>"}`).join(', ') +
        '}, "weather": "unchanged"}' +
        (cards ? ', "entities": [{"name": "<Name>", "kind": "character", "description": "<one sentence>", "looks": {"<key>": "<a few words>"}}]' : '') +
        '}') +
    ONE_LINE
  );
}
