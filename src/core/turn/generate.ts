import type { Adventure } from '../model/types';
import type { CompletionRequest, CompletionStats } from '../ports/provider';
import { trimUnfinishedSentence } from '../text/formatting';
import { runHook } from './hooks';
import type { Generated, PreparedContext, TurnDeps, TurnEvent } from './types';

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The request for `prepared`, built apart from `generate` so a trace can record it even if the stream fails. */
export function buildRequest(
  adventure: Adventure,
  prepared: Pick<PreparedContext, 'prompt' | 'stop'>,
  opts: { slotId?: number; seed?: number } = {},
): CompletionRequest {
  const s = adventure.settings.model;
  return {
    prompt: prepared.prompt,
    maxTokens: s.responseLength,
    temperature: s.temperature,
    topK: s.topK,
    topP: s.topP,
    minP: s.minP,
    presencePenalty: s.presencePenalty,
    frequencyPenalty: s.frequencyPenalty,
    repetitionPenalty: s.repetitionPenalty,
    seed: opts.seed ?? s.seed,
    stop: [...prepared.stop, '\n> '],
    cachePrompt: true,
    slotId: opts.slotId ?? 0,
  };
}

/** Stream a completion for `request`, then pass it through the onOutput hook. */
export async function* generate(adventure: Adventure, request: CompletionRequest, deps: TurnDeps, signal?: AbortSignal): AsyncGenerator<TurnEvent, Generated> {
  const startedAt = Date.now();
  let ttftMs: number | undefined;
  let text = '';
  let stats: CompletionStats | undefined;
  for await (const chunk of deps.provider.complete(request, signal)) {
    if (chunk.text) {
      ttftMs ??= Date.now() - startedAt;
      text += chunk.text;
      yield { type: 'token', text: chunk.text };
    }
    if (chunk.done) stats = chunk.stats;
  }
  const raw = adventure.settings.context.rawOutput ? text : trimUnfinishedSentence(text);
  const hook = await runHook(adventure, deps, 'onOutput', raw, adventure.actions, { info: { characterNames: [], actionCount: adventure.actions.length } });
  if (hook.error) return { text: raw, stats, ttftMs };
  if (hook.state.message) yield { type: 'message', text: hook.state.message };
  return { text: hook.text ?? raw, stats, ttftMs };
}
