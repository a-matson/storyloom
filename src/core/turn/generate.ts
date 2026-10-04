import type { Adventure } from '../model/types';
import type { CompletionRequest, CompletionStats } from '../ports/provider';
import { sentenceEndAfter, trimUnfinishedSentence } from '../text/formatting';
import { runHook } from './hooks';
import type { Generated, PreparedContext, TurnDeps, TurnEvent } from './types';

/** Tokens allowed past `responseLength` to reach a sentence end; 44 live turns never ran out of margin. [measured: 2026-10-02-gate-v.md] */
export const SOFT_STOP_MARGIN = 50;

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
    maxTokens: s.responseLength + SOFT_STOP_MARGIN,
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

/**
 * Stream a completion for `request`, then pass it through the onOutput hook.
 * Past `responseLength` tokens the stream is cut at the first sentence end
 * (soft stop); if none comes before the margin runs out, the trim cleans up.
 */
export async function* generate(adventure: Adventure, request: CompletionRequest, deps: TurnDeps, signal?: AbortSignal): AsyncGenerator<TurnEvent, Generated> {
  const startedAt = Date.now();
  const { responseLength } = adventure.settings.model;
  let ttftMs: number | undefined;
  let text = '';
  let stats: CompletionStats | undefined;
  // One streamed chunk is about one token on llama-server and OpenAI-style streams.
  let tokens = 0;
  let softFrom: number | undefined;
  for await (const chunk of deps.provider.complete(request, signal)) {
    if (chunk.stats) stats = chunk.stats;
    if (!chunk.text) continue;
    ttftMs ??= Date.now() - startedAt;
    if (++tokens >= responseLength) softFrom ??= text.length;
    text += chunk.text;
    yield { type: 'token', text: chunk.text };
    const end = softFrom === undefined ? 0 : sentenceEndAfter(text, softFrom);
    if (end) {
      // Leaving the loop cancels the stream, so the server stops generating.
      text = text.slice(0, end);
      stats = { ...stats, generatedTokens: stats?.generatedTokens ?? tokens, stopReason: 'soft' };
      break;
    }
  }
  const raw = adventure.settings.context.rawOutput ? text : trimUnfinishedSentence(text, stats?.stopReason);
  const hook = await runHook(adventure, deps, 'onOutput', raw, adventure.actions, { info: { characterNames: [], actionCount: adventure.actions.length } });
  if (hook.error) return { text: raw, stats, ttftMs };
  if (hook.state.message) yield { type: 'message', text: hook.state.message };
  return { text: hook.text ?? raw, stats, ttftMs };
}
