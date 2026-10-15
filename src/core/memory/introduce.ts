import type { Adventure } from '../model/types';
import { actionText } from '../model/types';
import { hashPrompt } from '../trace';
import { MAX_INTRODUCED } from '../schema/extraction';
import { knownAs, matchEntity, mergeEntity } from './entities';
import { passageOf, readTurn, type EntityUpdate, type ExtractDeps } from './extract';
import { foldEntities, newNamesIn, notAName } from './fold';
import { MEMORY_SPAN } from './memoryBank';
import { sceneNames } from './names';
import { withScene } from './scene';

/** Actions an introduction reads at least: the last AI output and the player line before it. [provisional] */
const INTRODUCE_SPAN = 2;

type TurnUpdate = EntityUpdate & { sceneUpdated: boolean };

/**
 * Makes a place card for a location no place is known as; true when it did. The new place sits top-level,
 * and when the scene was at a known place the player is asked whether it is inside it (a room read as a
 * new place: the bedroom case). [provisional: ask vs rule, open question 1 of the M13-1 plan]
 */
function notePlace(adventure: Adventure, location: string, at: number): boolean {
  const said = location.trim();
  const places = adventure.entities.filter((e) => e.kind === 'place');
  if (!said || knownAs(places, said)) return false;
  const was = adventure.plot.scene?.location;
  const inside = was === undefined ? undefined : (places.find((e) => e.id === was) ?? knownAs(places, was));
  adventure.entities = [...adventure.entities, mergeEntity(undefined, { name: said, kind: 'place', description: '' }, at)];
  if (inside) adventure.scriptState = { ...adventure.scriptState, __placeAsk: { place: said, inside: inside.name } };
  return true;
}
const none = (): TurnUpdate => ({ touched: 0, speakers: new Map(), sceneUpdated: false });

/**
 * The turn read: one short call after every turn for where it ends (place, who and which named
 * items are there), plus a card for each new name so one exists before the next turn. The first
 * call of an adventure reads its opening (capped at one memory span) instead.
 * `scriptState.__introducedAt`/`__introducedHash` mark the turn read; a retried output with other
 * text is read again. A cut call leaves the marker, so the next idle period retries it.
 */
export async function introduce(adventure: Adventure, deps: ExtractDeps): Promise<TurnUpdate> {
  const n = adventure.actions.length;
  const last = adventure.actions.at(-1);
  const { introductions, sceneEachTurn } = adventure.settings.memory;
  if (!last || !(introductions || sceneEachTurn)) return none();
  const hash = hashPrompt(actionText(last));
  const { __introducedAt: at, __introducedHash } = adventure.scriptState;
  if (at === n && __introducedHash === hash) return none();
  // From the last finished call: a call the next turn cut (it takes ~28 s) is read again with that turn. [measured: 2026-10-09-live-play-m11-2-read30.json]
  const range = { fromAction: Math.max(0, n - MEMORY_SPAN, Math.min(at ?? 0, n - INTRODUCE_SPAN)), toAction: n };
  const passage = passageOf(adventure, range);
  const now = adventure.plot.scene && sceneNames(adventure.plot.scene, adventure.entities);
  // Present without a card: the name guard drops a name that only opens sentences ("Weever nods.").
  const uncarded = (now?.present ?? []).filter((p) => !knownAs(adventure.entities, p) && passage.includes(p));
  // ponytail: names past the grammar's cap wait for the batch call; raise MAX_INTRODUCED if openings name more.
  const names = introductions ? [...new Set([...newNamesIn(adventure, range), ...uncarded])].slice(0, MAX_INTRODUCED) : [];
  // Aliases too, so a character the text calls "the dragon" resolves (the two P7c misses); new names, so one met this turn can be there;
  // and who is present without a card yet, or the enum has no word for them.
  const characters = adventure.entities.flatMap((e) => (e.kind === 'character' ? [e.name, ...e.aliases] : []));
  const cast = [...new Set([...characters, ...names, ...(now?.present ?? [])])];
  const prev = { location: now?.location, present: now?.present ?? [] };
  const reply = names.length || sceneEachTurn ? await readTurn(passage, names, prev, cast, deps) : null;
  adventure.scriptState = { ...adventure.scriptState, __introducedAt: n, __introducedHash: hash };
  if (!reply) return none();
  // Cards first, so the scene's names resolve to them.
  let touched = names.length ? foldEntities(adventure, reply.entities, passage, range, { present: uncarded }) : 0;
  // Through the entity first: a role alias ("the ferrywoman") is not a name by itself.
  const name = (s: string) => {
    const e = matchEntity(adventure.entities, s);
    const stored = e ? (e.kind === 'character' ? e.name : undefined) : s;
    return stored === undefined || notAName(adventure.plot, stored) ? undefined : stored;
  };
  const scene = sceneEachTurn ? reply.scene : undefined;
  if (scene && notePlace(adventure, scene.location, n - 1)) touched++;
  const plot = scene ? withScene(adventure.plot, scene, name, n - 1, { sourceId: last.id, sourceHash: hash }, adventure.entities) : adventure.plot;
  const sceneUpdated = plot !== adventure.plot;
  adventure.plot = plot;
  // Present by this read is a second sighting: `isConfirmed` kept a character the turn read carded out of the prompt until a batch range.
  if (scene) {
    const here = new Set(plot.scene?.present);
    adventure.entities = adventure.entities.map((e) => (here.has(e.id) && e.lastSeen < n - 1 ? (touched++, { ...e, lastSeen: n - 1 }) : e));
  }
  const call = deps.cuts?.calls?.at(-1);
  if (call) call.accepted = touched + (sceneUpdated ? 1 : 0);
  // No speakers: the short reply leaves them to the client guess and the batch call.
  return { touched, speakers: new Map(), sceneUpdated };
}
