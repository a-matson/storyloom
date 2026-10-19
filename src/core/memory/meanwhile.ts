import type { Adventure, Entity } from '../model/types';
import { newId } from '../model/types';
import { withContent } from '../text/content';
import { MEANWHILE_SYSTEM, meanwhilePrompt } from '../text/memoryPrompts';
import { renderTemplate } from '../text/templates';
import { current, indexAssertions } from './assertionIndex';
import { COMMON_WORDS } from './commonWords';
import { eventsSince } from './events';
import type { ExtractDeps } from './extract';
import { helperCall, sentencesOnly } from './helperCall';
import { MEANWHILE } from './looks';
import { playerName } from './you';

/** Actions a character is away before their return gets a meanwhile proposal. [provisional] */
export const RETURN_GAP = 12;
/** Events since they left that the helper is given, the latest. [provisional] */
const EVENTS_GIVEN = 6;
/** Words a meanwhile line keeps. [provisional] */
const MAX_WORDS = 30;
const TOKENS = 60;

export interface Return {
  entity: Entity;
  /** Action they left at (the first presence entry without them). */
  left: number;
  /** Action they came back at: the latest presence entry. */
  back: number;
}

type Read = Pick<Adventure, 'plot' | 'actions' | 'entities' | 'assertions'>;

/**
 * Characters the turn read just put back in the scene (the latest `presence` entry is the last action) after
 * `RETURN_GAP` actions or more away. Someone first met now is no return; one asked about at this return already is skipped,
 * so a re-read of the turn or a rejected reply does not call again.
 */
export function returning(adv: Read): Return[] {
  const presence = adv.plot.presence ?? [];
  const last = presence.at(-1);
  if (!last || last.at !== adv.actions.length - 1) return [];
  const before = presence.slice(0, -1);
  const asked = new Set(adv.assertions.filter((a) => a.kind === 'state' && a.key === MEANWHILE && a.since === last.at).map((a) => a.subject));
  return adv.entities.flatMap((entity) => {
    if (entity.kind !== 'character' || !last.present.includes(entity.id) || asked.has(entity.id)) return [];
    const i = before.findLastIndex((p) => p.present.includes(entity.id));
    const left = presence[i + 1]?.at;
    // Never here before, or here in the entry before this one.
    if (i < 0 || i === before.length - 1 || left === undefined || last.at - left < RETURN_GAP) return [];
    return [{ entity, left, back: last.at }];
  });
}

const lower = (w: string) => w.toLowerCase();
const wordsOf = (s: string) => s.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);

/**
 * The reply's first sentence, at most `MAX_WORDS` words; undefined when it is empty or a capitalised word is no known name's
 * word (and, opening the sentence, no common word either): an invented name.
 */
export function checkMeanwhile(text: string, known: readonly string[]): string | undefined {
  const first = /^[^.!?\n]+[.!?]?/.exec(text.trim().replace(/^["“]/, ''))?.[0].trim();
  if (!first) return undefined;
  const names = new Set(known.flatMap(wordsOf).map(lower));
  const words = wordsOf(first).map((w) => w.replace(/['’]s$/, ''));
  const invented = words.some((w, i) => /^\p{Lu}/u.test(w) && !names.has(lower(w)) && !(i === 0 && COMMON_WORDS.has(lower(w))));
  if (invented) return undefined;
  const all = first.split(/\s+/);
  const kept = all.slice(0, MAX_WORDS).join(' ');
  return all.length > MAX_WORDS ? `${kept.replace(/[,;:]$/, '')}.` : first;
}

/** One slot-1 call: the sentence, before the guard. */
async function ask(name: string, goal: string | undefined, events: readonly string[], deps: ExtractDeps): Promise<string> {
  const prompt = renderTemplate(deps.template, withContent(MEANWHILE_SYSTEM, deps.content), meanwhilePrompt(name, goal, events));
  const stop = [...new Set([...prompt.stop, '\n'])];
  const grammar = await sentencesOnly(deps.provider, 1);
  const req = { prompt: prompt.prompt, maxTokens: TOKENS, temperature: 0.7, topP: 0.9, stop, cachePrompt: false, slotId: 1, grammar };
  return (await helperCall('state', TOKENS, prompt.prompt, (signal) => deps.provider.complete(req, signal), deps)).text;
}

/**
 * For each character back after a long absence, one call over their confirmed goal and the events while they were away;
 * the accepted sentence is stored as a proposal (`state`, key `MEANWHILE`, `since` = the return) that ends their earlier one.
 * Nobody is asked about without a goal or an event to ground the line on.
 */
export async function readMeanwhile(adventure: Adventure, deps: ExtractDeps): Promise<{ changed: number }> {
  let changed = 0;
  const known = [...adventure.entities.flatMap((e) => [e.name, ...e.aliases]), playerName(adventure) ?? ''];
  for (const { entity: e, left, back } of returning(adventure)) {
    const ix = indexAssertions(adventure.assertions);
    const goal = current(ix.of(e.id), 'goal').findLast((a) => a.seen !== false)?.text;
    const events = eventsSince(adventure.assertions, left, back)
      .slice(-EVENTS_GIVEN)
      .map((a) => a.text);
    if (!goal && !events.length) continue;
    const line = checkMeanwhile(await ask(e.name, goal, events, deps), known);
    const call = deps.cuts?.calls?.at(-1);
    if (call) {
      call.accepted = line ? 1 : 0;
      if (!line) call.rejected = [{ value: call.reply, reason: 'invented' }];
    }
    if (!line) continue;
    const ended = adventure.assertions.map((a) =>
      a.subject === e.id && a.kind === 'state' && a.key === MEANWHILE && a.until === undefined ? { ...a, until: back } : a,
    );
    const p = { id: newId('as_'), subject: e.id, producer: 'batch', at: back, basis: 'inferred', since: back, seen: false } as const;
    adventure.assertions = [...ended, { ...p, kind: 'state', key: MEANWHILE, value: line }];
    changed++;
  }
  return { changed };
}
