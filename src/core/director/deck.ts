import { z } from 'zod';
import { actionText, type Action, type Adventure } from '../model';
import { genreKeys } from './beats';

/** Something that happens to the scene. `cue` opens the AI reply that plays it; `cooldown` overrides `COOLDOWN`. */
export interface Complication {
  cue: string;
  cooldown?: number | undefined;
}

/** Actions before a drawn card can be drawn again. [provisional] */
export const COOLDOWN = 12;

const DEFAULT_DECK = [
  'Just then, someone arrives: ',
  'The weather turns: ',
  'A message arrives, and it reads: "',
  'Time is running short: ',
  'An old injury flares, ',
  'A debt is called in: ',
];

/** Per `QUICK_STARTS` tag. Opening clauses the model finishes. [provisional] */
const GENRE_DECK: Readonly<Record<string, readonly string[]>> = {
  fantasy: [
    'Just then, a rider comes ',
    'The weather turns: ',
    'A raven lands with a message: "',
    'A bell rings out from the town, ',
    'An old wound flares, ',
    'Someone who is owed a debt appears: ',
    'Something moves in the dark, ',
  ],
  mystery: [
    'The telephone rings: ',
    'The lights flicker and go out, ',
    'A note has been slipped under the door: "',
    'Footsteps sound in the hall, ',
    'A clock strikes the hour, ',
    'A stranger asks for you by name: "',
  ],
  'sci-fi': [
    'An alarm sounds: ',
    'A transmission comes through: "',
    'The power fails, ',
    'A ship drops out of nowhere, ',
    'A countdown starts: ',
    'An old implant flares with pain, ',
  ],
  'slice-of-life': [
    'Just then, the door opens and ',
    'It starts to rain, ',
    'A phone buzzes with a message: "',
    'Someone remembers a deadline: ',
    'An old friend walks in, ',
    'A bill arrives: ',
  ],
};

const ScriptDeck = z.array(z.union([z.string().min(1), z.object({ cue: z.string().min(1), cooldown: z.optional(z.number().int().nonnegative()) })]));

type Deckable = Pick<Adventure, 'tags' | 'title' | 'scriptState'>;

/** `state.deck` when a script set one (strings or `{ cue, cooldown }`), else the first known genre's deck. */
export function deckOf(adv: Deckable): { deck: Complication[]; warning?: string } {
  const genre = genreKeys(adv)
    .map((g) => GENRE_DECK[g])
    .find((d) => d !== undefined);
  const fallback = (genre ?? DEFAULT_DECK).map((cue) => ({ cue }));
  const raw: unknown = adv.scriptState['deck'];
  if (raw === undefined) return { deck: fallback };
  const parsed = ScriptDeck.safeParse(raw);
  if (!parsed.success || parsed.data.length === 0) return { deck: fallback, warning: 'state.deck is not a list of cues; using the genre deck' };
  return { deck: parsed.data.map((c) => (typeof c === 'string' ? { cue: c } : c)) };
}

/** The deck card an AI action's text opens with; read back from the log, never stored. */
export const cueCard = (text: string, deck: readonly Complication[]): Complication | undefined => deck.find((c) => text.startsWith(c.cue));

/** The last action index each card's cue opened, by cue. */
export function drawn(actions: readonly Action[], deck: readonly Complication[]): Map<string, number> {
  const last = new Map<string, number>();
  actions.forEach((a, i) => {
    const card = a.type === 'continue' ? cueCard(actionText(a), deck) : undefined;
    if (card) last.set(card.cue, i);
  });
  return last;
}

/** A random card not drawn within its cooldown. */
export function drawComplication(
  adv: Deckable & Pick<Adventure, 'actions'>,
  random: () => number = Math.random,
): { cue: string; warning?: string } | { none: string; warning?: string } {
  const { deck, warning } = deckOf(adv);
  const last = drawn(adv.actions, deck);
  const open = deck.filter((c) => {
    const at = last.get(c.cue);
    return at === undefined || adv.actions.length - at > (c.cooldown ?? COOLDOWN);
  });
  const card = open[Math.floor(random() * open.length)];
  const extra = warning === undefined ? {} : { warning };
  return card ? { cue: card.cue, ...extra } : { none: 'Every complication is cooling down', ...extra };
}
