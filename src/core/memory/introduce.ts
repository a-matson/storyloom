import type { Adventure } from '../model/types';
import { actionText } from '../model/types';
import { hashPrompt } from '../trace';
import { namedInPassage } from './entities';
import { MAX_INTRODUCED } from '../schema/extraction';
import { foldEntities, introduceFromPassage, NOT_A_NAME, passageOf, type EntityUpdate, type ExtractDeps } from './extract';
import { MEMORY_SPAN } from './memoryBank';

/** Capitalised runs; a leading stop word is dropped from the run ("Then Mira" → "Mira"). */
const CAPITALISED = /\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)*/gu;

/** Capitalised mid-sentence often enough to pass `namedInPassage`, never a name. [provisional] */
const STOP = new Set('you the an it they we he she but and then when day night dawn morning midday afternoon evening his her its their your our my'.split(' '));

/** Actions an introduction reads at least: the last AI output and the player line before it. [provisional] */
const INTRODUCE_SPAN = 2;

/** Names in `text` not yet recorded: capitalised mid-sentence (or there once), not `known` (names and aliases). */
export function candidateNames(text: string, known: readonly string[]): string[] {
  const seen = new Set(known.map((k) => k.toLowerCase()));
  const out: string[] = [];
  for (const [run] of text.matchAll(CAPITALISED)) {
    const words = run.split(' ');
    while (words[0] && STOP.has(words[0].toLowerCase())) words.shift();
    const name = words.join(' ');
    if (!name || seen.has(name.toLowerCase()) || NOT_A_NAME.test(name) || !namedInPassage(name, text)) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

const none = (): EntityUpdate => ({ touched: 0, speakers: new Map() });

/**
 * One short entity call when the last turn names someone new, so a card exists before the next
 * turn. The first call of an adventure reads its opening (capped at one memory span) instead.
 * `scriptState.__introducedAt`/`__introducedHash` mark the turn read; a retried output with other
 * text is read again. A cut call leaves the marker, so the next idle period retries it.
 */
export async function introduce(adventure: Adventure, deps: ExtractDeps): Promise<EntityUpdate> {
  const n = adventure.actions.length;
  const last = adventure.actions.at(-1);
  if (!last || !adventure.settings.memory.introductions) return none();
  const hash = hashPrompt(actionText(last));
  const { __introducedAt: at, __introducedHash } = adventure.scriptState;
  if (at === n && __introducedHash === hash) return none();
  // From the last finished call: a call the next turn cut (it takes ~28 s) is read again with that turn. [measured: 2026-10-09-live-play-m11-2-read30.json]
  const range = { fromAction: Math.max(0, n - MEMORY_SPAN, Math.min(at ?? 0, n - INTRODUCE_SPAN)), toAction: n };
  const known = adventure.entities.flatMap((e) => [e.name, ...e.aliases]);
  const names = [...new Set(adventure.actions.slice(range.fromAction).flatMap((a) => candidateNames(actionText(a), known)))];
  const passage = passageOf(adventure, range);
  // ponytail: names past the grammar's cap wait for the batch call; raise MAX_INTRODUCED if openings name more.
  const reply = names.length ? await introduceFromPassage(passage, names.slice(0, MAX_INTRODUCED), deps) : null;
  if (deps.cancel?.aborted) return none();
  adventure.scriptState = { ...adventure.scriptState, __introducedAt: n, __introducedHash: hash };
  if (!reply) return none();
  // No speakers: the short reply leaves them to the client guess and the batch call.
  const cards = reply.map((e) => Object.assign(e, { facts: [] }));
  return { touched: foldEntities(adventure, cards, passage, n - 1), speakers: new Map() };
}
