import type { ActionLog } from '../log/actionLog';
import type { Adventure, TurnTrace } from '../model/types';
import { formatPlayerInput } from '../text/formatting';
import { buildRequest, generate, randomSeed } from './generate';
import { runHook } from './hooks';
import { prepareContext } from './prepare';
import { startRun, traceOf, traced, type PromptedRun, type TurnRun } from './traced';
import type { Generated, PlayerTurnType, PreparedContext, TurnDeps, TurnEvent } from './types';

export { randomSeed };

/** Build the request, stream it and note both on `run` so the trace has them even if the stream fails. */
async function* generateFor(adventure: Adventure, run: TurnRun, prepared: PreparedContext, deps: TurnDeps, signal?: AbortSignal, seed?: number) {
  run.prepared = prepared;
  run.request = buildRequest(adventure, prepared, seed === undefined ? {} : { seed });
  const generated = yield* generate(adventure, run.request, deps, signal);
  run.generated = generated;
  return generated;
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
  const run = startRun('turn');
  const { turnId } = run;
  return traced(
    adventure,
    deps,
    run,
    async function* () {
      if (input.type !== 'continue') {
        const hook = await runHook(adventure, deps, 'onInput', input.text, log.actions, { info: { characterNames: [], actionCount: log.length } });
        if (!hook.error && hook.stop) {
          yield { type: 'stopped', turnId, reason: 'Unable to run scenario scripts' };
          return;
        }
        const text = hook.error ? input.text : (hook.text ?? input.text);
        const action = log.append(input.type, formatPlayerInput(input.type, text, adventure.plot), { turnId });
        adventure.actions = log.actions;
        yield { type: 'player', turnId, action };
      }
      const prepared = await prepareContext(adventure, log.actions, deps);
      if ('stopped' in prepared) {
        yield { type: 'stopped', turnId, reason: prepared.stopped };
        return;
      }
      yield { type: 'context', turnId, result: prepared.result, prompt: prepared.prompt, stop: prepared.stop };
      const { text, stats } = yield* generateFor(adventure, run, prepared, deps, signal);
      const action = log.append('continue', text, { turnId, ...(stats ? { stats } : {}) });
      run.actionId = action.id;
      adventure.actions = log.actions;
      yield { type: 'done', turnId, action, text, stats };
    },
    signal,
  );
}

/**
 * Retry: regenerate the last AI output as a new retry alternative, using the
 * log as it was before that output. Vary the seed so alternatives differ.
 */
export function retryLast(adventure: Adventure, log: ActionLog, deps: TurnDeps, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
  const run = startRun('retry');
  const { turnId } = run;
  return traced(
    adventure,
    deps,
    run,
    async function* () {
      const last = log.last;
      if (last?.type !== 'continue') {
        yield { type: 'error', turnId, kind: 'unknown', message: 'Nothing to retry: the last action is not an AI output.' };
        return;
      }
      run.actionId = last.id;
      const prepared = await prepareContext(adventure, log.actions.slice(0, -1), deps);
      if ('stopped' in prepared) {
        yield { type: 'stopped', turnId, reason: prepared.stopped };
        return;
      }
      yield { type: 'context', turnId, result: prepared.result, prompt: prepared.prompt, stop: prepared.stop };
      const { text, stats } = yield* generateFor(adventure, run, prepared, deps, signal, randomSeed());
      const updated = log.addVersion(last.id, text);
      if (!updated) throw new Error('The action being retried disappeared from the log.');
      adventure.actions = log.actions;
      yield { type: 'done', turnId, action: updated, text, stats };
    },
    signal,
  );
}

/**
 * Generate one more alternative for the prompt of the last turn without
 * touching the log (retry prefetch). Runs on `slotId` (default 1) so the
 * story slot's KV cache is left alone. The caller adds the result as a
 * version when the player actually presses Retry, and persists the trace
 * only then: `actionId` is the action the alternative would re-roll.
 */
export async function generateAlternative(
  adventure: Adventure,
  prepared: PreparedContext,
  deps: TurnDeps,
  actionId: string,
  signal?: AbortSignal,
  slotId = 1,
): Promise<Generated & { trace: TurnTrace }> {
  const request = buildRequest(adventure, prepared, { slotId, seed: randomSeed() });
  const run: PromptedRun = { ...startRun('retry'), actionId, prepared, request };
  const gen = generate(adventure, request, deps, signal);
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  run.generated = next.value;
  return { ...next.value, trace: traceOf(adventure, deps, run, 'done') };
}
