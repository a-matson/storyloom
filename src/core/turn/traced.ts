import { actionText, newId } from '../model/types';
import { REPEAT_WINDOW } from '../text/repetition';
import type { Adventure, TurnErrorKind, TurnKind, TurnOutcome, TurnTrace } from '../model/types';
import type { CompletionRequest } from '../ports/provider';
import { TurnErrorKind as ErrorKinds } from '../schema';
import { buildTrace } from '../trace';
import type { Generated, PreparedContext, TurnDeps, TurnEvent } from './types';

/** What a turn learns on its way through; the trace is built from it at the end. */
export interface TurnRun {
  turnId: string;
  kind: TurnKind;
  startedAt: number;
  prepared?: PreparedContext;
  request?: CompletionRequest;
  generated?: Generated;
  actionId?: string;
  /** `log()` lines and errors of every hook run in this turn. */
  scriptLogs: string[];
  error?: { message: string; status?: number | undefined };
}

/** `ProviderError` lives in adapters, so its HTTP status is read by shape. */
function errorDetail(e: unknown): { message: string; status?: number | undefined } {
  const status = typeof e === 'object' && e !== null && 'status' in e && typeof e.status === 'number' ? e.status : undefined;
  return { message: e instanceof Error ? e.message : String(e), status };
}

/** The AI outputs a repetition is measured against: the last few before this turn's own action. */
function previousOutputs(adventure: Adventure, actionId: string | undefined): string[] {
  return adventure.actions
    .filter((a) => (a.type === 'continue' || a.type === 'start') && a.id !== actionId)
    .slice(-REPEAT_WINDOW)
    .map(actionText);
}

export function startRun(kind: TurnKind): TurnRun {
  return { turnId: newId('turn_'), kind, startedAt: Date.now(), scriptLogs: [] };
}

/** Failures carry a `kind` (`ProviderError`, `StorageError`); anything else is unknown. */
export function errorKindOf(e: unknown): TurnErrorKind {
  const kind = typeof e === 'object' && e !== null && 'kind' in e ? e.kind : undefined;
  return ErrorKinds.options.find((k) => k === kind) ?? 'unknown';
}

/** A run that got as far as sending a prompt, so it has a trace. */
export type PromptedRun = TurnRun & Required<Pick<TurnRun, 'prepared' | 'request'>>;

/** Assembles the trace for a finished run; the one place that knows which fields go in. */
export function traceOf(adventure: Adventure, deps: TurnDeps, run: PromptedRun, outcome: TurnOutcome, errorKind?: TurnErrorKind): TurnTrace {
  const { prepared, request } = run;
  return buildTrace({
    turnId: run.turnId,
    kind: run.kind,
    adventureId: adventure.id,
    createdAt: run.startedAt,
    outcome,
    errorKind,
    actionId: run.actionId,
    result: prepared.result,
    prompt: prepared.prompt,
    scriptCache: prepared.scriptCache,
    request,
    template: adventure.settings.template,
    providerId: deps.provider.id,
    modelId: adventure.settings.modelId,
    scriptLogs: run.scriptLogs,
    stats: run.generated?.stats,
    ttftMs: run.generated?.ttftMs,
    totalMs: Date.now() - run.startedAt,
    output: run.generated?.text,
    previousOutputs: run.generated ? previousOutputs(adventure, run.actionId) : [],
    error: run.error,
  });
}

/**
 * Errors become events; an abort becomes `stopped`. A turn that reached a prompt ends with a
 * `trace` event whatever the outcome.
 */
export async function* traced(
  adventure: Adventure,
  deps: TurnDeps,
  run: TurnRun,
  body: () => AsyncGenerator<TurnEvent>,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const { turnId } = run;
  let outcome: TurnOutcome = 'done';
  let errorKind: TurnErrorKind | undefined;
  try {
    for await (const e of body()) {
      if (e.type === 'stopped') outcome = 'stopped';
      if (e.type === 'error') {
        outcome = 'error';
        errorKind = e.kind;
        run.error = { message: e.message };
      }
      yield e;
    }
  } catch (e) {
    if (signal?.aborted) {
      outcome = 'stopped';
      errorKind = 'cancelled';
      yield { type: 'stopped', turnId, reason: 'cancelled' };
    } else {
      outcome = 'error';
      errorKind = errorKindOf(e);
      run.error = errorDetail(e);
      yield { type: 'error', turnId, kind: errorKind, message: run.error.message };
    }
  }
  const { prepared, request } = run;
  if (prepared && request) yield { type: 'trace', trace: traceOf(adventure, deps, { ...run, prepared, request }, outcome, errorKind) };
}
