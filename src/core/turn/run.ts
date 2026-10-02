import type { ActionLog } from '../log/actionLog';
import type { Adventure } from '../model/types';
import type { CompletionStats } from '../ports/provider';
import { formatPlayerInput, joinStory, trimUnfinishedSentence } from '../text/formatting';
import { runHook } from './hooks';
import { prepareContext } from './prepare';
import type { Generated, PlayerTurnType, PreparedContext, TurnDeps, TurnEvent } from './types';

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Stream a completion for `prepared`, then pass it through the onOutput hook. */
async function* generate(
  adventure: Adventure,
  prepared: Pick<PreparedContext, 'prompt' | 'stop'>,
  deps: TurnDeps,
  signal?: AbortSignal,
  opts: { slotId?: number; seed?: number } = {},
): AsyncGenerator<TurnEvent, Generated> {
  const s = adventure.settings.model;
  let text = '';
  let stats: CompletionStats | undefined;
  const stream = deps.provider.complete(
    {
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
    },
    signal,
  );
  for await (const chunk of stream) {
    if (chunk.text) {
      text += chunk.text;
      yield { type: 'token', text: chunk.text };
    }
    if (chunk.done) stats = chunk.stats;
  }
  const raw = adventure.settings.context.rawOutput ? text : trimUnfinishedSentence(text);
  const hook = await runHook(adventure, deps, 'onOutput', raw, adventure.actions, { info: { characterNames: [], actionCount: adventure.actions.length } });
  if (hook.error) return { text: raw, stats };
  if (hook.state.message) yield { type: 'message', text: hook.state.message };
  return { text: hook.text ?? raw, stats };
}

/** Errors become events; an abort becomes `stopped`. */
async function* guarded(run: () => AsyncGenerator<TurnEvent>, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
  try {
    yield* run();
  } catch (e) {
    if (signal?.aborted) yield { type: 'stopped', reason: 'cancelled' };
    else yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Play one turn: optionally add a player action, then generate the AI's reply.
 * `input.type === 'continue'` skips the player action. Mutates `log` and `adventure`;
 * persisting is the caller's job.
 */
export function runTurn(
  adventure: Adventure,
  log: ActionLog,
  input: { type: PlayerTurnType | 'continue'; text: string },
  deps: TurnDeps,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  return guarded(async function* () {
    if (input.type !== 'continue') {
      const hook = await runHook(adventure, deps, 'onInput', input.text, log.actions, { info: { characterNames: [], actionCount: log.length } });
      if (!hook.error && hook.stop) {
        yield { type: 'stopped', reason: 'Unable to run scenario scripts' };
        return;
      }
      const text = hook.error ? input.text : (hook.text ?? input.text);
      const action = log.append(input.type, formatPlayerInput(input.type, text, adventure.plot));
      adventure.actions = log.actions;
      yield { type: 'player', action };
    }
    const prepared = await prepareContext(adventure, log.actions, deps);
    if ('stopped' in prepared) {
      yield { type: 'stopped', reason: prepared.stopped };
      return;
    }
    yield { type: 'context', result: prepared.result, prompt: prepared.prompt, stop: prepared.stop };
    const { text, stats } = yield* generate(adventure, prepared, deps, signal);
    const action = log.append('continue', text, stats ? { stats } : {});
    adventure.actions = log.actions;
    yield { type: 'done', action, text, stats };
  }, signal);
}

/**
 * Retry: regenerate the last AI output as a new retry alternative, using the
 * log as it was before that output. Vary the seed so alternatives differ.
 */
export function retryLast(adventure: Adventure, log: ActionLog, deps: TurnDeps, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
  return guarded(async function* () {
    const last = log.last;
    if (last?.type !== 'continue') {
      yield { type: 'error', message: 'Nothing to retry: the last action is not an AI output.' };
      return;
    }
    const prepared = await prepareContext(adventure, log.actions.slice(0, -1), deps);
    if ('stopped' in prepared) {
      yield { type: 'stopped', reason: prepared.stopped };
      return;
    }
    yield { type: 'context', result: prepared.result, prompt: prepared.prompt, stop: prepared.stop };
    const { text, stats } = yield* generate(adventure, prepared, deps, signal, { seed: randomSeed() });
    const updated = log.addVersion(last.id, text);
    if (!updated) throw new Error('The action being retried disappeared from the log.');
    adventure.actions = log.actions;
    yield { type: 'done', action: updated, text, stats };
  }, signal);
}

/**
 * Generate one more alternative for the prompt of the last turn without
 * touching the log (retry prefetch). Runs on `slotId` (default 1) so the
 * story slot's KV cache is left alone. The caller adds the result as a
 * version when the player actually presses Retry.
 */
export async function generateAlternative(
  adventure: Adventure,
  prepared: Pick<PreparedContext, 'prompt' | 'stop'>,
  deps: TurnDeps,
  signal?: AbortSignal,
  slotId = 1,
): Promise<Generated> {
  const gen = generate(adventure, prepared, deps, signal, { slotId, seed: randomSeed() });
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  return next.value;
}

/** Full story text of the active path (for export and summarisation). */
export function storyText(adventure: Adventure): string {
  return joinStory(adventure.actions);
}
