import { z } from 'zod/mini';
import type { Action, Adventure, Entity } from '../model/types';
import { actionText, newId } from '../model/types';
import { NOW_CHARS, stateChange, stateRead, type StateChange } from '../schema/extraction';
import { statePrompt } from '../text/statePrompt';
import { hashPrompt } from '../trace';
import { indexAssertions } from './assertionIndex';
import { mergeAssertions, type Rest } from './assertionWrites';
import { entityNamedIn, knownAs, within } from './entities';
import { helperJson, passageOf, type ExtractDeps } from './extract';
import { grammarOf } from './extractJsonSchema';
import { heldBy, holderOf, YOU } from './items';
import { currentStates } from './looks';
import { norm } from './names';

/** Actions the state read reads: the last AI output and the player line before it. [measured: 2026-10-13-state-probe-m12-dogfood P8b] */
const STATE_SPAN = 2;
/** P8b: 5.5–6.4 s for one present character, 12 s for three; at 40, 0/24 calls hit the cap. [measured: 2026-10-15-state-s4b.json] */
const TOKENS_EACH = 40;
const TOKENS_CAP = 160;

type Subject = Pick<Entity, 'id' | 'kind' | 'name' | 'aliases' | 'canon' | 'cardId' | 'canonKeys'>;
const PLAYER: Subject = { id: YOU, kind: 'character', name: YOU, aliases: ['your', 'yourself'] };

export type StateReject = 'at-range' | 'wrong-subject' | 'cut' | 'unchanged' | 'unknown-item';
export interface StateUpdate {
  changed: number;
  rejected: { value: string; reason: StateReject }[];
}

/** Who the read asks about: the present characters and items (the scene's and the player's), then the player; none when nobody and nothing is there. */
export function stateCast(adventure: Adventure): Subject[] {
  const { entities, plot } = adventure;
  const ix = indexAssertions(adventure.assertions);
  const of = (kind: Entity['kind'], ref: string) =>
    entities.find((e) => e.id === ref && e.kind === kind) ??
    knownAs(
      entities.filter((e) => e.kind === kind),
      ref,
    );
  const here = [
    ...(plot.scene?.present ?? []).map((p) => of('character', p)),
    ...(plot.scene?.items ?? []).map((i) => of('item', i)),
    ...heldBy(entities, ix, YOU),
  ].filter((e) => e !== undefined);
  // ponytail: two entities of one name share an enum value; the first wins.
  const cast = [...new Map(here.map((e) => [e.name, e])).values()];
  return cast.length ? [...cast, PLAYER] : [];
}

const isPlayerLine = (a: Action | undefined) => a?.type === 'do' || a?.type === 'say';
const named = (s: Subject, text: string) => entityNamedIn([s], text) !== undefined;
/** Words a finished value never ends on: the 12B padded values toward the cap ("near cottage in the"). [measured: 2026-10-13-state-m13-3.json] */
const DANGLING = /\b(?:and|or|the|a|an|in|of|to|with|at|on|but)[\s,]*$|[,(…-]\s*$/iu;
// A full-length value ending inside a word was cut by the grammar's cap.
const isCut = (now: string) => (now.length >= NOW_CHARS && /[\p{L}\p{N}]$/u.test(now)) || DANGLING.test(now.trim());

/**
 * Read B: what changed for the present cast in the last two actions. An entry stands only on the action it
 * points at (`at`), which must name its subject or nobody else of the cast. Accepted values supersede their
 * key (`producer: turn`, `basis: player` on a do/say); `holds` sets the item's holder; a `condition` whose
 * action names another character or item also proposes an effect with that cause. A retried output is read again.
 */
export async function readState(adventure: Adventure, deps: ExtractDeps): Promise<StateUpdate> {
  const out: StateUpdate = { changed: 0, rejected: [] };
  const n = adventure.actions.length;
  const last = adventure.actions.at(-1);
  const cast = stateCast(adventure);
  if (!last || !cast.length) return out;
  const hash = hashPrompt(actionText(last));
  if (adventure.scriptState.__stateAt === n && adventure.scriptState.__stateHash === hash) return out;
  const range = { fromAction: Math.max(0, n - STATE_SPAN), toAction: n };
  // A turn rarely changes more than one key per subject; 2 per subject invited echoes. [measured: 2026-10-15-state-s4b.json]
  const max = cast.length + 1;
  const reply = await ask(adventure, cast, passageOf(adventure, range), max, deps);
  adventure.scriptState = { ...adventure.scriptState, __stateAt: n, __stateHash: hash };
  if (!reply) return out;

  // Later `at` last, so its write supersedes an earlier one for the same key.
  for (const c of reply.slice(0, max).toSorted((a, b) => a.at - b.at)) {
    const s = cast.find((x) => x.name === c.who);
    const action = adventure.actions[c.at];
    const text = action ? actionText(action) : '';
    const reason = s && (c.at < range.fromAction || c.at >= range.toAction || !text ? 'at-range' : rejectOf(adventure, cast, s, c, text));
    if (!s || reason) {
      if (reason) out.rejected.push({ value: `${c.who} ${c.key}: ${c.now}`, reason });
      continue;
    }
    const at: Rest = { at: c.at, basis: isPlayerLine(action) ? 'player' : 'stated' };
    const now = c.now.trim();
    const held = knownAs(items(adventure), now);
    if (c.key === 'holds') write(adventure, held ?? s, { holder: s === PLAYER ? YOU : s.name }, at, out);
    else write(adventure, s, { [c.key]: now }, at, out);
    // ponytail: the first other character or item the action names is the cause; wrong when it names two.
    const cause =
      c.key === 'condition'
        ? entityNamedIn(
            adventure.entities.filter((e) => e.id !== s.id && (e.kind === 'item' || e.kind === 'character')),
            text,
          )
        : undefined;
    if (cause?.kind === 'item' || cause?.kind === 'character') {
      const effect = { kind: 'effect', condition: now, cause: { kind: cause.kind, id: cause.id, text: cause.name } } as const;
      adventure.assertions = [
        ...adventure.assertions,
        { id: newId('as_'), subject: s.id, producer: 'turn', ...at, basis: at.basis ?? 'stated', since: c.at, seen: false, ...effect },
      ];
    }
  }
  const call = deps.cuts?.calls?.at(-1);
  if (call?.job === 'state') {
    call.accepted = out.changed;
    call.rejected = out.rejected;
  }
  return out;
}

const items = (adventure: Adventure) => adventure.entities.filter((e) => e.kind === 'item');

/** Why an entry in range is dropped: its action names another of the cast and not it, the grammar cut it, or it says what the record already holds. */
function rejectOf(adventure: Adventure, cast: readonly Subject[], s: Subject, c: StateChange, text: string): StateReject | undefined {
  if (!named(s, text) && cast.some((o) => o !== s && o !== PLAYER && named(o, text))) return 'wrong-subject';
  if (isCut(c.now)) return 'cut';
  const now = c.now.trim();
  const ix = indexAssertions(adventure.assertions);
  if (c.key === 'holds') {
    const held = knownAs(items(adventure), now);
    if (s.kind === 'item') return 'wrong-subject';
    if (!held) return 'unknown-item';
    return norm(holderOf(ix, held) ?? '') === norm(s === PLAYER ? YOU : s.name) ? 'unchanged' : undefined;
  }
  const was = currentStates(ix.of(s.id))[c.key];
  return !now || (was !== undefined && within(now, was)) ? 'unchanged' : undefined;
}

/** The call: each subject's record (states, and what it holds), then the passage. Null when the reply is unusable. */
function ask(adventure: Adventure, cast: readonly Subject[], passage: string, max: number, deps: ExtractDeps): Promise<StateChange[] | null> {
  const [first = YOU, ...rest] = cast.map((s) => s.name);
  const ix = indexAssertions(adventure.assertions);
  const records = cast.map((s) => {
    const held = heldBy(adventure.entities, ix, s.id === YOU ? YOU : s.name).map((e) => e.name);
    return { who: s.name, now: { ...currentStates(ix.of(s.id)), ...(held.length && { holds: held.join(', ') }) } };
  });
  const item = stateChange([first, ...rest]);
  return helperJson(
    (g) => statePrompt(records, passage, max, g),
    grammarOf(stateRead([first, ...rest], max)),
    Math.min(TOKENS_CAP, TOKENS_EACH * cast.length),
    (cut) => (data) => {
      const list = z.object({ changes: z.array(z.unknown()) }).safeParse(data).data?.changes;
      // Repair closes a reply cut mid-entry: its last entry is unfinished.
      return list ? (cut ? list.slice(0, -1) : list).flatMap((x) => item.safeParse(x).data ?? []) : null;
    },
    deps,
    'state',
  );
}

function write(adventure: Adventure, s: Subject, state: Record<string, string>, at: Rest, out: StateUpdate): void {
  const own = adventure.assertions.filter((a) => a.subject === s.id);
  const mine = mergeAssertions(s, own, { description: '', facts: [], state }, at.at, { producer: 'turn', source: () => at });
  adventure.assertions = [...adventure.assertions.filter((a) => a.subject !== s.id), ...mine];
  out.changed++;
}
