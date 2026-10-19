import { named, spotlight } from '../context/spotlight';
import { current, type AssertionIndex } from '../memory/assertionIndex';
import { isConfirmed } from '../memory/facts';
import { playerName } from '../memory/you';
import type { Adventure, Entity } from '../model';
import { BEATS, cueFor, fits, genreKeys, repertoire, usedBeats } from './beats';

type BeatPick = { entity: Entity; beat: string; cue: string } | { none: string };

type Scene = Pick<Adventure, 'plot' | 'actions' | 'entities' | 'tags' | 'title'>;

const GOAL = 'act on the goal';

/** Confirmed characters the scene has present, the player's own excepted. */
function presentCast(adv: Scene, ix: AssertionIndex): Entity[] {
  const present = adv.plot.scene?.present ?? [];
  const you = playerName(adv);
  return adv.entities.filter(
    (e) => e.kind === 'character' && isConfirmed(e, ix.of(e.id)) && present.some((n) => n === e.id || named(e, n)) && !(you && named(e, you)),
  );
}

/** `/beat` text: a present character's name (or alias) first, then the beat; either may be left out. */
function readAsk(ask: string, here: Entity[]): { who?: Entity; beat: string } {
  const text = ask.trim().toLowerCase();
  for (const e of here)
    for (const n of [e.name, ...e.aliases].map((s) => s.toLowerCase()))
      if (text === n || text.startsWith(`${n} `)) return { who: e, beat: text.slice(n.length).trim() };
  return { beat: text };
}

/**
 * The beat a Beat press plays: the quietest present character (`spotlight` quietFirst) with an eligible beat, i.e.
 * one in their repertoire they did not play in their last 3, that fits the scene's tension, and `act on the goal` only with a confirmed goal; chosen
 * with `random` among those. `ask` (`/beat Tamsin lie`) names the character, the beat, or both.
 */
export function pickBeat(adv: Scene, ix: AssertionIndex, random: () => number = Math.random, ask = ''): BeatPick {
  const here = spotlight(presentCast(adv, ix), adv.actions, ix, 'quietFirst');
  if (here.length === 0) return { none: 'Nobody here to act' };
  const { who, beat: asked } = readAsk(ask, here);
  const genres = genreKeys(adv);
  for (const e of who ? [who] : here) {
    const own = repertoire(e, genres);
    if (asked) {
      const beat = [...own, ...BEATS.map((b) => b.id)].find((b) => b.toLowerCase() === asked);
      if (beat) return { entity: e, beat, cue: cueFor(beat, e.name) };
      continue;
    }
    const used = new Set(usedBeats(adv.actions, e));
    const goal = current(ix.of(e.id), 'goal').some((a) => a.seen !== false);
    const open = own.filter((b) => !used.has(b) && (goal || b !== GOAL) && fits(b, adv.plot.scene?.tension));
    const beat = open[Math.floor(random() * open.length)];
    if (beat !== undefined) return { entity: e, beat, cue: cueFor(beat, e.name) };
  }
  return { none: asked ? `No beat "${asked}" for ${who?.name ?? 'anyone here'}` : 'Nobody here has a beat left to play' };
}
