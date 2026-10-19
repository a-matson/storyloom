import { jsonrepair } from 'jsonrepair';
import { z } from 'zod/mini';
import { renderScene } from '../context/render';
import type { Adventure } from '../model/types';
import { parseJsonReply } from '../text/jsonReply';
import { CHECK_SYSTEM, checkPrompt } from '../text/prompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { eventsOf, indexAssertions, isCurrent } from './assertionIndex';
import { helperCall } from './helperCall';
import { currentStates, MEANWHILE } from './looks';
import { knownAs, sceneNames } from './names';
import type { MaintenanceDeps } from './memoryJobs';
import { YOU } from './you';

const CheckJson = z.object({ contradicts: z.boolean(), fact: z.string() });
const { $schema: _dialect, ...CHECK_JSON_SCHEMA } = z.toJSONSchema(CheckJson);

/** A copied fact this short ("She", "the quay") matches too much to name the line it came from. */
const MIN_QUOTE = 12;
/** A verdict and one quoted line. [provisional] */
const CHECK_TOKENS = 60;

/**
 * What an output is checked against: the locked values of who is present (`Mira: hair is grey`), always,
 * and the scene line when the setting is on (on dogfood outputs it flagged 2 lines, both wrong
 * [measured: 2026-10-17-contradiction-m20-2.json]). Empty means no call.
 */
export function checkInputs(adv: Pick<Adventure, 'entities' | 'assertions' | 'plot' | 'settings'>): string[] {
  const ix = indexAssertions(adv.assertions);
  const present = (adv.plot.scene?.present ?? []).flatMap((p) => adv.entities.find((e) => e.id === p) ?? knownAs(adv.entities, p) ?? []);
  const locked = [...new Set(present)].flatMap((e) => {
    const now = currentStates(ix.of(e.id));
    return (e.canonKeys ?? []).flatMap((k) => (now[k] ? [`${e.name}: ${k} is ${now[k]}`] : []));
  });
  if (!adv.settings.memory.contradictionCheck) return locked;
  const scene = renderScene(adv.plot.scene && sceneNames(adv.plot.scene, adv.entities));
  return [...(scene ? [`Scene: ${scene}`] : []), ...locked];
}

/**
 * One helper call on slot 1: the input line `output` contradicts, or null. A `fact` that is not
 * (part of) an input line is dropped, so the badge never shows something the model made up.
 */
export async function checkOutput(
  output: string,
  lines: readonly string[],
  deps: Pick<MaintenanceDeps, 'provider' | 'template' | 'signal' | 'content' | 'cuts'>,
): Promise<string | null> {
  if (!lines.length) return null;
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(deps.template, withContent(CHECK_SYSTEM, deps.content), checkPrompt(output, lines), caps.jsonSchema ? '' : '{');
  const { text } = await helperCall(
    'check',
    CHECK_TOKENS,
    rendered.prompt,
    (signal) =>
      deps.provider.complete(
        {
          prompt: rendered.prompt,
          maxTokens: CHECK_TOKENS,
          temperature: 0,
          stop: rendered.stop,
          cachePrompt: false,
          slotId: 1,
          jsonSchema: caps.jsonSchema ? CHECK_JSON_SCHEMA : undefined,
        },
        signal,
      ),
    { cancel: deps.signal, cuts: deps.cuts },
  );
  if (deps.signal?.aborted) return null;
  const reply = parseJsonReply(caps.jsonSchema ? text : `{${text}`, (d) => CheckJson.safeParse(d).data ?? null, jsonrepair);
  const fact = reply?.contradicts ? reply.fact.trim() : '';
  const line = fact ? (lines.find((l) => l === fact) ?? (fact.length >= MIN_QUOTE ? lines.find((l) => l.includes(fact)) : undefined)) : undefined;
  const call = deps.cuts?.calls?.at(-1);
  if (call) {
    call.accepted = line ? 1 : 0;
    if (fact && !line) call.rejected = [{ value: fact, reason: 'not-an-input-line' }];
  }
  return line ?? null;
}

/**
 * Every current assertion of each id as a line the check can quote, with the action it was read from: looks and
 * states (latest per key), identity, traits, voice, stances and events. Proposals and conflicts are not the record.
 */
export function recordLines(adv: Pick<Adventure, 'entities' | 'assertions'>, ids: readonly string[]): { line: string; at: number }[] {
  const ix = indexAssertions(adv.assertions);
  const nameOf = (id: string) => (id === YOU ? 'you' : adv.entities.find((e) => e.id === id)?.name);
  return ids.flatMap((id) => {
    const name = nameOf(id);
    if (!name) return [];
    const keyed = new Map<string, { line: string; at: number }>();
    const rest: { line: string; at: number }[] = [];
    for (const a of ix.of(id)) {
      if (!isCurrent(a) || a.seen === false) continue;
      if ((a.kind === 'look' || a.kind === 'state') && a.key !== MEANWHILE)
        keyed.set(a.key, { line: a.key === 'legacy' ? `${name}: ${a.value}` : `${name}: ${a.key} is ${a.value}`, at: a.at });
      else if (a.kind === 'identity' || a.kind === 'trait') rest.push({ line: `${name}: ${a.text}`, at: a.at });
      else if (a.kind === 'voice') rest.push({ line: `${name}: speaks: ${a.text}`, at: a.at });
      else if (a.kind === 'relationship') rest.push({ line: `${name} → ${nameOf(a.to) ?? a.to}: ${a.stance}`, at: a.at });
    }
    const events = eventsOf(adv.assertions, id).flatMap((a) => (a.seen === false ? [] : [{ line: `${name}: ${a.text}`, at: a.at }]));
    return [...keyed.values(), ...rest, ...events];
  });
}
