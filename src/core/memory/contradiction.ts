import { jsonrepair } from 'jsonrepair';
import { z } from 'zod/mini';
import { renderScene } from '../context/render';
import type { Adventure } from '../model/types';
import { collect } from '../ports/provider';
import { parseJsonReply } from '../text/jsonReply';
import { CHECK_SYSTEM, checkPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { entityNamedIn } from './entities';
import type { MaintenanceDeps } from './memoryJobs';

const CheckJson = z.object({ contradicts: z.boolean(), fact: z.string() });
const { $schema: _dialect, ...CHECK_JSON_SCHEMA } = z.toJSONSchema(CheckJson);

/** A copied fact this short ("She", "the quay") matches too much to name the line it came from. */
const MIN_QUOTE = 12;

/**
 * What one output is checked against: the scene line, pinned and conflict facts, and the
 * description of every canon entity the output or the scene names. Empty means no call.
 */
export function checkInputs(adv: Pick<Adventure, 'entities' | 'plot'>, output: string): string[] {
  const scene = renderScene(adv.plot.scene);
  const named = `${output}\n${scene}`;
  return [
    ...(scene ? [`Scene: ${scene}`] : []),
    ...adv.entities.flatMap((e) => e.facts.filter((f) => f.pinned || f.conflict).map((f) => `${e.name}: ${f.text}`)),
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
  deps: Pick<MaintenanceDeps, 'provider' | 'template' | 'signal'>,
): Promise<string | null> {
  if (!lines.length) return null;
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(deps.template, CHECK_SYSTEM, checkPrompt(output, lines), caps.jsonSchema ? '' : '{');
  const { text } = await trackJob('check', () =>
    collect(
      deps.provider.complete(
        {
          prompt: rendered.prompt,
          maxTokens: 60,
          temperature: 0,
          stop: rendered.stop,
          cachePrompt: false,
          slotId: 1,
          jsonSchema: caps.jsonSchema ? CHECK_JSON_SCHEMA : undefined,
        },
        deps.signal,
      ),
    ),
  );
  if (deps.signal?.aborted) return null;
  const reply = parseJsonReply(caps.jsonSchema ? text : `{${text}`, (d) => CheckJson.safeParse(d).data ?? null, jsonrepair);
  const fact = reply?.contradicts ? reply.fact.trim() : '';
  if (!fact) return null;
  return lines.find((l) => l === fact) ?? (fact.length >= MIN_QUOTE ? lines.find((l) => l.includes(fact)) : undefined) ?? null;
}
