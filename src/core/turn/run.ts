import { cueBeat } from '../director/beats';
import { cueCard, deckOf } from '../director/deck';
import type { ActionLog } from '../log/actionLog';
import { actionText, type Adventure, type TurnTrace } from '../model/types';
import { formatPlayerInput } from '../text/formatting';
import { GATE_NOTES, GATE_WINDOW, gateOutput, previousOutputs } from './gate';
import { buildRequest, generate, randomSeed } from './generate';
import { runHook } from './hooks';
import { prepareContext } from './prepare';
import { startRun, traceOf, traced, type PromptedRun, type TurnRun } from './traced';
import type { Generated, PlayerTurnType, PreparedContext, TurnDeps, TurnEvent } from './types';

export { randomSeed };

/** A beat's cue goes at the end of the prompt, so the model finishes its sentence instead of restating it. */
const withCue = (p: PreparedContext | { stopped: string }, cue: string | undefined) => (cue && !('stopped' in p) ? { ...p, prompt: p.prompt + cue, cue } : p);

/**
 * Build the request, stream it and note both on `run` so the trace has them even if the stream fails.
 * Returns what the model wrote; the caller puts a cue in front of it.
 */
async function* generateFor(adventure: Adventure, run: TurnRun, prepared: PreparedContext, deps: TurnDeps, signal?: AbortSignal, seed?: number) {
  run.prepared = prepared;
  run.request = buildRequest(adventure, prepared, seed === undefined ? {} : { seed });
  if (prepared.cue) yield { type: 'token', text: prepared.cue } satisfies TurnEvent;
  const generated = yield* generate(adventure, run.request, deps, signal, run.scriptLogs);
  run.generated = generated;
  return generated;
}

/**
 * Play one turn: optionally add a player action, then generate the AI's reply.
 * `input.type === 'continue'` skips the player action; a Continue's `cue` (a beat) opens the reply.
 * Mutates `log` and `adventure`; persisting is the caller's job.
 */
export function runTurn(
  adventure: Adventure,
  log: ActionLog,
  input: { type: PlayerTurnType | 'continue'; text: string; cue?: string | undefined },
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
      // A Continue runs onInput too (empty text, its returned text ignored), so an Input script can clear what it set.
      const continued = input.type === 'continue';
      const hook = await runHook(
        adventure,
        deps,
        'onInput',
        continued ? '' : input.text,
        log.actions,
        { info: { characterNames: [], actionCount: log.length, actionType: input.type, consequences: adventure.settings.consequences } },
        run.scriptLogs,
      );
      // A script that stops the turn or empties the input gets the same message (spec).
      if (!hook.error && (hook.stop || (hook.text === '' && input.text !== '' && !continued))) {
        yield { type: 'stopped', turnId, reason: 'Unable to run scenario scripts' };
        return;
      }
      if (!continued) {
        const text = hook.error ? input.text : (hook.text ?? input.text);
        const action = log.append(input.type, formatPlayerInput(input.type, text, adventure.plot), { turnId });
        adventure.actions = log.actions;
        yield { type: 'player', turnId, action };
      }
      const cue = continued ? input.cue : undefined;
      const prepared = withCue(await prepareContext(adventure, log.actions, deps, run.scriptLogs), cue);
      if ('stopped' in prepared) {
        yield { type: 'stopped', turnId, reason: prepared.stopped };
        return;
      }
      yield { type: 'context', turnId, ...prepared };
      const first = yield* generateFor(adventure, run, prepared, deps, signal);
      const before = log.actions;
      const reason = gateOutput(first.text, previousOutputs(before, undefined, GATE_WINDOW), {
        playerType: input.type,
        thirdPerson: adventure.plot.thirdPerson?.enabled ?? false,
      });
      const retried = reason !== undefined && adventure.settings.model.autoRetry;
      if (reason) run.gate = { reason, retried };
      // The first reply is logged before the re-roll so a failed retry still leaves it, and Retry can bring it back.
      const opening = cue ?? '';
      let action = log.append('continue', opening + first.text, { turnId, ...(first.stats ? { stats: first.stats } : {}) });
      run.actionId = action.id;
      adventure.actions = log.actions;
      let { text, stats } = first;
      if (reason && retried) {
        yield { type: 'regenerate', turnId, actionId: action.id, reason };
        const again = withCue(await prepareContext(adventure, before, deps, run.scriptLogs, GATE_NOTES[reason]), cue);
        if ('stopped' in again) {
          yield { type: 'stopped', turnId, reason: again.stopped };
          return;
        }
        yield { type: 'context', turnId, ...again };
        ({ text, stats } = yield* generateFor(adventure, run, again, deps, signal, randomSeed()));
        action = log.addVersion(action.id, opening + text) ?? action;
        adventure.actions = log.actions;
      }
      yield { type: 'done', turnId, action, text: opening + text, stats };
    },
    signal,
  );
}

/**
 * Retry: regenerate the last AI output as a new retry alternative, using the
 * log as it was before that output. Vary the seed so alternatives differ.
 * `note` (the fact the output broke) rides in this one prompt only. `reroll` hands scripts
 * `info.retry` = the output's version count, so the dice roll again.
 */
export function retryLast(
  adventure: Adventure,
  log: ActionLog,
  deps: TurnDeps,
  signal?: AbortSignal,
  { note, reroll = false }: { note?: string | undefined; reroll?: boolean } = {},
): AsyncGenerator<TurnEvent> {
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
      // A beat's or complication's retry plays the same one: the cue is read back from the output's opening.
      const lastText = actionText(last);
      const cue =
        cueBeat(
          lastText,
          adventure.entities.filter((e) => e.kind === 'character'),
        )?.cue ?? cueCard(lastText, deckOf(adventure).deck)?.cue;
      const prepared = withCue(await prepareContext(adventure, log.actions.slice(0, -1), deps, run.scriptLogs, note, reroll ? last.versions.length : 0), cue);
      if ('stopped' in prepared) {
        yield { type: 'stopped', turnId, reason: prepared.stopped };
        return;
      }
      yield { type: 'context', turnId, ...prepared };
      const generated = yield* generateFor(adventure, run, prepared, deps, signal, randomSeed());
      const text = (cue ?? '') + generated.text;
      const updated = log.addVersion(last.id, text);
      if (!updated) throw new Error('The action being retried disappeared from the log.');
      adventure.actions = log.actions;
      yield { type: 'done', turnId, action: updated, text, stats: generated.stats };
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
  const gen = generate(adventure, request, deps, signal, run.scriptLogs);
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  run.generated = next.value;
  return { ...next.value, text: (prepared.cue ?? '') + next.value.text, trace: traceOf(adventure, deps, run, 'done') };
}
