import type { Adventure } from '../model/types';
import { actionText } from '../model/types';
import { hashPrompt } from '../trace';
import { MAX_INTRODUCED } from '../schema/extraction';
import { knownAs, matchEntity, mergeEntity } from './entities';
import type { EntityUpdate } from './batch';
import { passageOf, readTurn, type ExtractDeps } from './extract';
import { foldEntities, newNamesIn, notAName } from './fold';
import { MEMORY_SPAN } from './memoryBank';
import { indexAssertions } from './assertionIndex';
import { castLabels, namesOf, sceneNames } from './names';
import { withScene } from './scene';
import { applyChanges, stateAsk, stateCast, type StateUpdate } from './stateRead';

/** Actions an introduction reads at least: the last AI output and the player line before it. [provisional] */
const INTRODUCE_SPAN = 2;

type TurnUpdate = EntityUpdate & { sceneUpdated: boolean; state?: StateUpdate };

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
const none = (): TurnUpdate => ({ touched: 0, sceneUpdated: false });

// Aliases and roles too, so a character the text calls "the dragon" resolves (the two P7c misses); new names, so one met this turn can be there;
// and who is present without a card yet, or the enum has no word for them. A namesake goes by its label.
const castOf = (adventure: Adventure, names: readonly string[], present: readonly string[]) => {
  const labels = castLabels(adventure.entities, indexAssertions(adventure.assertions));
  const characters = adventure.entities.flatMap((e) => (e.kind === 'character' ? [labels.get(e.id) ?? e.name, ...namesOf(e).slice(1)] : []));
  return [...new Set([...characters, ...names, ...present])];
};

/** An edit of an older output (F30): cards for the new names that action holds. The scene and the turn-read marker are the last turn's, so both stay. */
async function readEdit(adventure: Adventure, deps: ExtractDeps, i: number): Promise<TurnUpdate> {
  const range = { fromAction: i, toAction: i + 1 };
  const names = adventure.settings.memory.introductions && i < adventure.actions.length ? newNamesIn(adventure, range).slice(0, MAX_INTRODUCED) : [];
  if (!names.length) return none();
  const passage = passageOf(adventure, range);
  const present = (adventure.plot.scene && sceneNames(adventure.plot.scene, adventure.entities).present) ?? [];
  const reply = await readTurn(passage, names, { location: undefined, present }, castOf(adventure, names, present), deps);
  const touched = reply ? foldEntities(adventure, reply.entities, passage, range) : 0;
  const call = deps.cuts?.calls?.at(-1);
  if (call) call.accepted = touched;
  return { touched, sceneUpdated: false };
}

/**
 * The turn read: one short call after every turn for where it ends (place, who and which named
 * items are there), plus a card for each new name so one exists before the next turn. The first
 * call of an adventure reads its opening (capped at one memory span) instead.
 * `scriptState.__introducedAt`/`__introducedHash` mark the turn read; a retried output with other
 * text is read again. A cut call leaves the marker, so the next idle period retries it.
 */
export async function introduce(adventure: Adventure, deps: ExtractDeps, edited?: number, opts?: { state?: boolean }): Promise<TurnUpdate> {
  if (edited !== undefined) return readEdit(adventure, deps, edited);
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
  const prev = { location: now?.location, present: now?.present ?? [] };
  const asked = names.length > 0 || sceneEachTurn;
  // Read B merged (M17-1): its subjects are the scene before this reply, since the reply carries both.
  const subjects = asked && opts?.state ? stateCast(adventure) : [];
  const state = subjects.length ? stateAsk(adventure, subjects) : undefined;
  const reply = asked ? await readTurn(passage, names, prev, castOf(adventure, names, prev.present), deps, state) : null;
  adventure.scriptState = {
    ...adventure.scriptState,
    __introducedAt: n,
    __introducedHash: hash,
    // The standalone read then skips this turn, as after its own call.
    ...(state && { __stateAt: n, __stateHash: hash }),
  };
  if (!reply) return none();
  // Cards first, so the scene's names resolve to them.
  let touched = names.length ? foldEntities(adventure, reply.entities, passage, range, { present: uncarded }) : 0;
  // Through the entity first: a role alias ("the ferrywoman") is not a name by itself.
  const name = (s: string) => {
    // ponytail: a namesake's label resolves to its name, and the scene stores names, so two namesakes share a presence; store ids if that bites.
    const e = matchEntity(adventure.entities, s) ?? (s.includes('(') ? knownAs(adventure.entities, s, indexAssertions(adventure.assertions)) : undefined);
    const stored = e ? (e.kind === 'character' ? e.name : undefined) : s;
    return stored === undefined || notAName(adventure.plot, stored) ? undefined : stored;
  };
  const scene = sceneEachTurn ? reply.scene : undefined;
  if (scene && notePlace(adventure, scene.location, n - 1)) touched++;
  const plot = scene ? withScene(adventure.plot, scene, name, n - 1, { sourceId: last.id, sourceHash: hash }, adventure.entities, passage) : adventure.plot;
  const sceneUpdated = plot !== adventure.plot;
  adventure.plot = plot;
  // Present by this read is a second sighting: `isConfirmed` kept a character the turn read carded out of the prompt until a batch range.
  if (scene) {
    const here = new Set(plot.scene?.present);
    adventure.entities = adventure.entities.map((e) => (here.has(e.id) && e.lastSeen < n - 1 ? (touched++, { ...e, lastSeen: n - 1 }) : e));
  }
  // After the scene and the cards, so `holds` can name an item carded this turn.
  const changed = state && applyChanges(adventure, subjects, reply.changes ?? [], state.max);
  const call = deps.cuts?.calls?.at(-1);
  if (call) {
    call.accepted = touched + (sceneUpdated ? 1 : 0) + (changed?.changed ?? 0);
    if (changed) call.rejected = changed.rejected;
  }
  return { touched, sceneUpdated, ...(changed && { state: changed }) };
}
