import type { Adventure } from '../model/types';
import type { CompletionRequest, CompletionStats } from '../ports/provider';
import { findPreset, MODEL_PRESETS } from '../text/modelPresets';
import { paragraphEndAfter, trimUnfinishedSentence } from '../text/formatting';
import { runHook } from './hooks';
import type { Generated, PreparedContext, TurnDeps, TurnEvent } from './types';

/** Tokens allowed past `responseLength` to reach a paragraph break; at the margin the sentence trim stands. [provisional] */
export const SOFT_STOP_MARGIN = 80;

/** A reply that ends on its own below this share of `responseLength` is continued once. [provisional] */
export const LENGTH_FLOOR = 0.5;

/** Dynamic samplers: per-turn (temperature offset, topK factor) around the loaded preset, cycling. [provisional] */
const JITTER: readonly (readonly [number, number])[] = [
  [-0.1, 0.8],
  [0.1, 1.2],
  [0, 0.9],
  [0, 1.1],
];

/** [provisional] wording from SPEC-scripting-api. */
const SCRIPT_EMPTIED_OUTPUT = 'A custom script running on this scenario failed. Please try again or fix the script.';

/** `kind` is what `errorKindOf` reads, so the turn fails as `stalled`. */
function stalled(ms: number): Error {
  const message = `The model sent nothing for ${Math.round(ms / 1000)} s; the server may be busy with another request.`;
  return Object.assign(new Error(message), { kind: 'stalled' as const });
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The request for `prepared`, built apart from `generate` so a trace can record it even if the stream fails. */
export function buildRequest(
  adventure: Adventure,
  prepared: Pick<PreparedContext, 'prompt' | 'stop'>,
  opts: { slotId?: number; seed?: number } = {},
): CompletionRequest {
  const model = adventure.settings.model;
  const s = { ...model };
  let seed = opts.seed ?? s.seed;
  if (model.dynamic) {
    // Samplers are not in the prompt, so jittering them leaves the KV cache prefix intact. Only the
    // loaded model's own preset is used: another family's samplers would not suit it.
    const turn = adventure.actions.length;
    const preset = findPreset(adventure.settings.modelId ?? '') ?? MODEL_PRESETS[0];
    Object.assign(s, preset?.settings);
    const [dTemp, dTopK] = JITTER[turn % JITTER.length] ?? [0, 1];
    s.temperature = Math.max(0, +(s.temperature + dTemp).toFixed(2));
    if (s.topK !== undefined) s.topK = Math.max(1, Math.round(s.topK * dTopK));
    seed = opts.seed ?? Math.imul(turn + 1, 2654435761) >>> 1;
  }
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
    seed,
    stop: [...prepared.stop, '\n> '],
    cachePrompt: true,
    slotId: opts.slotId ?? 0,
  };
}

interface Streamed {
  text: string;
  stats?: CompletionStats | undefined;
  /** Milliseconds from the call to the first streamed token. */
  ttftMs?: number | undefined;
  /** Tokens streamed by this call alone. */
  tokens: number;
}

/** One streamed completion; `before` tokens already count towards `responseLength`, so the soft stop is global. */
async function* stream(
  request: CompletionRequest,
  responseLength: number,
  before: number,
  deps: TurnDeps,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent, Streamed> {
  const startedAt = Date.now();
  let ttftMs: number | undefined;
  let text = '';
  let stats: CompletionStats | undefined;
  // One streamed chunk is about one token on llama-server and OpenAI-style streams.
  let tokens = 0;
  let softFrom: number | undefined;
  // Only the first token is watched: a server busy with another slot sends nothing at all, while a
  // stream that has started keeps going at a few tokens a second even on CPU.
  const watch = new AbortController();
  const limit = deps.ttftTimeoutMs;
  const timer = limit === undefined ? undefined : setTimeout(() => watch.abort(), limit);
  try {
    for await (const chunk of deps.provider.complete(request, signal ? AbortSignal.any([signal, watch.signal]) : watch.signal)) {
      if (chunk.stats) stats = chunk.stats;
      if (!chunk.text) continue;
      clearTimeout(timer);
      ttftMs ??= Date.now() - startedAt;
      if (before + ++tokens >= responseLength) softFrom ??= text.length;
      text += chunk.text;
      yield { type: 'token', text: chunk.text };
      const end = softFrom === undefined ? 0 : paragraphEndAfter(text, softFrom);
      if (end) {
        // Leaving the loop cancels the stream, so the server stops generating.
        text = text.slice(0, end);
        stats = { ...stats, generatedTokens: stats?.generatedTokens ?? tokens, stopReason: 'soft' };
        break;
      }
    }
  } catch (e) {
    if (watch.signal.aborted && !signal?.aborted) throw stalled(limit ?? 0);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  return { text, stats, ttftMs, tokens };
}

/**
 * Stream a completion for `request`, then pass it through the onOutput hook.
 * Past `responseLength` tokens the stream is cut at the first paragraph break
 * (soft stop); if none comes before the margin runs out, the trim cleans up.
 * A reply the model ends below the length floor is continued once.
 */
export async function* generate(
  adventure: Adventure,
  request: CompletionRequest,
  deps: TurnDeps,
  signal?: AbortSignal,
  scriptLogs?: string[],
): AsyncGenerator<TurnEvent, Generated> {
  const { responseLength } = adventure.settings.model;
  const first = yield* stream(request, responseLength, 0, deps, signal);
  const { ttftMs } = first;
  let { text, stats } = first;
  const ended = stats?.stopReason === 'eos' || stats?.stopReason === 'stop';
  if (ended && text.trim() !== '' && first.tokens < LENGTH_FLOOR * responseLength) {
    // The model stopped early on its own: one more go with its text as the start of the reply.
    const more = yield* stream(
      { ...request, prompt: request.prompt + text, maxTokens: request.maxTokens - first.tokens, seed: randomSeed() },
      responseLength,
      first.tokens,
      deps,
      signal,
    );
    if (more.text !== '') {
      const glue = /\s$/.test(text) || /^\s/.test(more.text) ? '' : /[.!?"”’…]$/.test(text) ? '\n\n' : ' ';
      text += glue + more.text;
    }
    stats = {
      ...stats,
      ...more.stats,
      generatedTokens: (stats?.generatedTokens ?? first.tokens) + (more.stats?.generatedTokens ?? more.tokens),
      continued: true,
    };
  }
  const raw = adventure.settings.context.rawOutput ? text : trimUnfinishedSentence(text, stats?.stopReason);
  const hook = await runHook(
    adventure,
    deps,
    'onOutput',
    raw,
    adventure.actions,
    { info: { characterNames: [], actionCount: adventure.actions.length } },
    scriptLogs,
  );
  if (hook.error) return { text: raw, stats, ttftMs };
  // A script that empties the output leaves nothing to show; the turn fails rather than logging a blank action.
  if (hook.text === '' && raw !== '') throw new Error(SCRIPT_EMPTIED_OUTPUT);
  if (hook.state.message) yield { type: 'message', text: hook.state.message };
  return { text: hook.text ?? raw, stats, ttftMs };
}
