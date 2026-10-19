import { pickBeat } from '@core/director';
import { indexAssertions } from '@core/memory';
import type { GameSession } from './session';

/** The Beat button and `/beat [name] [beat]`: a Continue whose reply opens with a present character's beat. */
export function beat(host: GameSession, text = ''): void {
  if (host.getSnapshot().busy) return;
  const pick = pickBeat(host.adv, indexAssertions(host.adv.assertions), Math.random, text);
  if ('none' in pick) return host.emit({ notice: pick.none });
  host.submit('continue', '', pick.cue);
}
