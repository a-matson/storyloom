import { newId } from '../model/types';
import type { Adventure, TurnErrorKind, TurnKind, TurnOutcome } from '../model/types';
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
}

export function startRun(kind: TurnKind): TurnRun {
  return { turnId: newId('turn_'), kind, startedAt: Date.now() };
}

/** Failures carry a `kind` (`ProviderError`, `StorageError`); anything else is unknown. */
function errorKindOf(e: unknown): TurnErrorKind {
  const kind = typeof e === 'object' && e !== null && 'kind' in e ? e.kind : undefined;
  return ErrorKinds.options.find((k) => k === kind) ?? 'unknown';
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
        errorKind = 'unknown';
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
      yield { type: 'error', turnId, message: e instanceof Error ? e.message : String(e) };
    }
  }
  const { prepared, request } = run;
  if (!prepared || !request) return;
  yield {
    type: 'trace',
    trace: buildTrace({
      turnId,
      kind: run.kind,
      adventureId: adventure.id,
      createdAt: run.startedAt,
      outcome,
      errorKind,
      actionId: run.actionId,
      result: prepared.result,
      prompt: prepared.prompt,
      request,
      template: adventure.settings.template,
      providerId: deps.provider.id,
      modelId: adventure.settings.modelId,
      stats: run.generated?.stats,
      ttftMs: run.generated?.ttftMs,
      totalMs: Date.now() - run.startedAt,
    }),
  };
}
