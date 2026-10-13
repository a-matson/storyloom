import type { Adventure } from '../model/types';
import { actionText } from '../model/types';
import { hashPrompt } from '../trace';
import { MAX_INTRODUCED } from '../schema/extraction';
import { matchEntity } from './entities';
import { passageOf, readTurn, type EntityUpdate, type ExtractDeps } from './extract';
import { foldEntities, newNamesIn, notAName } from './fold';
import { MEMORY_SPAN } from './memoryBank';
import { withScene } from './scene';

/** Actions an introduction reads at least: the last AI output and the player line before it. [provisional] */
const INTRODUCE_SPAN = 2;

type TurnUpdate = EntityUpdate & { sceneUpdated: boolean };
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
  // ponytail: names past the grammar's cap wait for the batch call; raise MAX_INTRODUCED if openings name more.
  const names = introductions ? newNamesIn(adventure, range).slice(0, MAX_INTRODUCED) : [];
  const passage = passageOf(adventure, range);
  const reply = names.length || sceneEachTurn ? await readTurn(passage, names, deps) : null;
  adventure.scriptState = { ...adventure.scriptState, __introducedAt: n, __introducedHash: hash };
  if (!reply) return none();
  // Cards first, so the scene's names resolve to them.
  const touched = names.length ? foldEntities(adventure, reply.entities, passage, range) : 0;
  const name = (s: string) => (notAName(adventure.plot, s) ? undefined : (matchEntity(adventure.entities, s)?.name ?? s));
  const plot = sceneEachTurn ? withScene(adventure.plot, reply.scene, name, n - 1, { sourceId: last.id, sourceHash: hash }) : adventure.plot;
  const sceneUpdated = plot !== adventure.plot;
  adventure.plot = plot;
  const call = deps.cuts?.calls?.at(-1);
  if (call) call.accepted = touched + (sceneUpdated ? 1 : 0);
  // No speakers: the short reply leaves them to the client guess and the batch call.
  return { touched, speakers: new Map(), sceneUpdated };
}
