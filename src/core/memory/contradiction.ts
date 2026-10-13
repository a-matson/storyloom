import { jsonrepair } from 'jsonrepair';
import { z } from 'zod/mini';
import { renderScene } from '../context/render';
import type { Adventure } from '../model/types';
import { parseJsonReply } from '../text/jsonReply';
import { CHECK_SYSTEM, checkPrompt } from '../text/prompts';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { indexAssertions, textOf } from './assertionIndex';
import { entityNamedIn } from './entities';
import { helperCall } from './helperCall';
import { sceneNames } from './names';
import type { MaintenanceDeps } from './memoryJobs';

const CheckJson = z.object({ contradicts: z.boolean(), fact: z.string() });
const { $schema: _dialect, ...CHECK_JSON_SCHEMA } = z.toJSONSchema(CheckJson);

/** A copied fact this short ("She", "the quay") matches too much to name the line it came from. */
const MIN_QUOTE = 12;
/** A verdict and one quoted line. [provisional] */
const CHECK_TOKENS = 60;

/**
 * What one output is checked against: the scene line, pinned and conflict facts, and the
 * description of every canon entity the output or the scene names. Empty means no call.
 */
export function checkInputs(adv: Pick<Adventure, 'entities' | 'assertions' | 'plot'>, output: string): string[] {
  const scene = renderScene(adv.plot.scene && sceneNames(adv.plot.scene, adv.entities));
  const named = `${output}\n${scene}`;
  const ix = indexAssertions(adv.assertions);
  return [
    ...(scene ? [`Scene: ${scene}`] : []),
    ...adv.entities.flatMap((e) =>
      ix
        .of(e.id)
        .filter((a) => a.pinned || a.kind === 'conflict')
        .map((a) => `${e.name}: ${textOf(a)}`),
    ),
    ...adv.entities
      .filter((e) => e.canon === true && e.description.trim() !== '' && entityNamedIn([e], named) !== undefined)
      .map((e) => `${e.name}: ${e.description.trim()}`),
  ];
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
