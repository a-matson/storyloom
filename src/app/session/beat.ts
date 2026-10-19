import { drawComplication, pickBeat } from '@core/director';
import { indexAssertions } from '@core/memory';
import type { GameSession } from './session';

/** The Beat button and `/beat [name] [beat]`: a Continue whose reply opens with a present character's beat. */
export function beat(host: GameSession, text = ''): void {
  if (host.getSnapshot().busy) return;
  const pick = pickBeat(host.adv, indexAssertions(host.adv.assertions), Math.random, text);
  if ('none' in pick) return host.emit({ notice: pick.none });
  host.submit('continue', '', pick.cue);
}

/** `/complicate`: a Continue whose reply opens with a card from the deck (`state.deck`, else the genre's). */
export function complicate(host: GameSession): void {
  if (host.getSnapshot().busy) return;
  const draw = drawComplication(host.adv);
  if (draw.warning) host.emit({ notice: draw.warning });
  if ('none' in draw) return host.emit({ notice: draw.none });
  host.submit('continue', '', draw.cue);
}
