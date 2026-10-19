import { directorDue, drawComplication, drawDirector, pickBeat } from '@core/director';
import { indexAssertions } from '@core/memory';
import type { Scene } from '@core/model';
import { Tension } from '@core/schema';
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
  play(host, draw);
}

function withTension(host: GameSession, tension: Scene['tension']): void {
  host.mutate((_, adv) => {
    const { tension: _old, ...scene } = adv.plot.scene ?? { present: [] };
    adv.plot = { ...adv.plot, scene: tension ? { ...scene, tension } : scene };
  });
}

/** A drawn card's tension becomes the scene's before its reply, so that reply already runs at it. */
function play(host: GameSession, draw: { cue: string; tension?: Scene['tension'] }, director?: true): void {
  if (draw.tension) withTension(host, draw.tension);
  host.submit('continue', '', draw.cue, director);
}

/** `/tension quiet|tense|action|off`: set or clear the scene's tension. Never an action, like `/time`. */
export function setTension(host: GameSession, text: string): void {
  const word = text.trim().toLowerCase();
  const parsed = Tension.safeParse(word);
  if (!parsed.success && word !== 'off') return host.emit({ notice: `Could not read "${text.trim()}": try /tension quiet, tense, action or off` });
  withTension(host, parsed.data);
  host.emit({ notice: parsed.data ? `Tension: ${parsed.data}` : 'Tension cleared' });
}

/** After a player turn: when the director is due, a cued Continue of its own, labelled `director`. */
export function direct(host: GameSession, every: number): void {
  if (host.getSnapshot().busy || !directorDue(host.adv, every)) return;
  const draw = drawDirector(host.adv, indexAssertions(host.adv.assertions), every);
  if ('cue' in draw) play(host, draw, true);
}
