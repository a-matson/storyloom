import type { AssertionIndex } from '../memory/assertionIndex';
import { actionText, type Action } from '../model';
import { cueBeat } from './beats';
import { cueCard, deckOf, drawComplication, type Draw } from './deck';
import { pickBeat } from './pick';

type Directed = Parameters<typeof pickBeat>[0] & Parameters<typeof drawComplication>[0];

const isPlayer = (a: Action | undefined) => a?.type === 'do' || a?.type === 'say' || a?.type === 'story';

/** Per action: 'beat' or 'card' for a Continue that opens with a cue, read back from the log. */
function cuesOf(adv: Directed): ('beat' | 'card' | undefined)[] {
  const cast = adv.entities.filter((e) => e.kind === 'character');
  const { deck } = deckOf(adv);
  return adv.actions.map((a) => {
    if (a.type !== 'continue') return undefined;
    const text = actionText(a);
    return cueBeat(text, cast) ? 'beat' : cueCard(text, deck) ? 'card' : undefined;
  });
}

/** Player turns since the last action `hit` marks (all of them when none does). */
function turnsSince(adv: Directed, hit: (c: 'beat' | 'card' | undefined) => boolean): number {
  const cues = cuesOf(adv);
  let turns = 0;
  for (let i = adv.actions.length - 1; i >= 0 && !hit(cues[i]); i--) if (isPlayer(adv.actions[i])) turns++;
  return turns;
}

/**
 * The director plays now: the last action is the AI reply to a player turn, and `every` player turns have passed
 * since the last cued Continue. A cued Continue is never a reply to a player turn, so the director never chains.
 */
export function directorDue(adv: Directed, every: number): boolean {
  const n = adv.actions.length;
  return adv.actions[n - 1]?.type === 'continue' && isPlayer(adv.actions[n - 2]) && turnsSince(adv, (c) => c !== undefined) >= every;
}

/** The director's cue: a complication when none came in the last `2 × every` player turns, else a beat (then a card). */
export function drawDirector(adv: Directed, ix: AssertionIndex, every: number, random: () => number = Math.random): Draw {
  const card = () => drawComplication(adv, random);
  const beat = () => pickBeat(adv, ix, random);
  const order = turnsSince(adv, (c) => c === 'card') >= 2 * every ? [card, beat] : [beat, card];
  let last: Draw = { none: 'The director has nothing to play' };
  for (const draw of order) {
    last = draw();
    if ('cue' in last) return { cue: last.cue, ...('tension' in last && last.tension && { tension: last.tension }) };
  }
  return last;
}
