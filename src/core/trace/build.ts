import type { ContextBuildResult, ScriptCache } from '../context';
import type { TurnErrorKind, TurnKind, TurnOutcome, TurnTrace } from '../model/types';
import type { CompletionRequest, CompletionStats } from '../ports/provider';
import { hashPrompt } from './hash';
import { overlappingJobs } from './jobLog';

/** Characters of prompt kept per trace. [provisional] */
export const TRACE_PROMPT_CAP = 64_000;

export interface TraceInput {
  turnId: string;
  kind: TurnKind;
  adventureId: string;
  createdAt: number;
  outcome: TurnOutcome;
  errorKind?: TurnErrorKind | undefined;
  actionId?: string | undefined;
  result: ContextBuildResult;
  prompt: string;
  /** The request as sent; its seed and stop list are the ones that took effect. */
  request: CompletionRequest;
  template: string;
  providerId: string;
  modelId?: string | undefined;
  stats?: CompletionStats | undefined;
  scriptLogs?: string[] | undefined;
  scriptCache?: ScriptCache | undefined;
  ttftMs?: number | undefined;
  totalMs: number;
}

export function buildTrace(i: TraceInput): TurnTrace {
  const { result, request: r } = i;
  const truncated = i.prompt.length > TRACE_PROMPT_CAP;
  return {
    turnId: i.turnId,
    adventureId: i.adventureId,
    ...(i.actionId ? { actionId: i.actionId } : {}),
    kind: i.kind,
    createdAt: i.createdAt,
    outcome: i.outcome,
    ...(i.errorKind ? { errorKind: i.errorKind } : {}),
    promptHash: hashPrompt(i.prompt),
    // The tail is kept: the newest actions and the instruction block are what a bad turn is usually about.
    prompt: truncated ? i.prompt.slice(-TRACE_PROMPT_CAP) : i.prompt,
    promptChars: i.prompt.length,
    promptTruncated: truncated,
    sections: result.sections.map((s) => ({ kind: s.kind, tokens: s.tokens, cacheable: s.cacheable, trimmed: s.trimmed ?? false })),
    budget: { ...result.budget },
    triggeredCardIds: result.triggeredCards.map((m) => m.card.id),
    droppedCardIds: result.droppedCards.map((m) => m.card.id),
    memoryIds: result.usedMemories.map((m) => m.id),
    historyRange: result.historyRange,
    droppedSections: result.droppedSections,
    warnings: result.warnings,
    sampler: {
      maxTokens: r.maxTokens,
      temperature: r.temperature,
      topK: r.topK,
      topP: r.topP,
      minP: r.minP,
      presencePenalty: r.presencePenalty,
      frequencyPenalty: r.frequencyPenalty,
      repetitionPenalty: r.repetitionPenalty,
      seed: r.seed,
      stop: r.stop ?? [],
    },
    template: i.template,
    providerId: i.providerId,
    modelId: i.modelId,
    stats: i.stats && {
      promptTokens: i.stats.promptTokens,
      cachedTokens: i.stats.cachedTokens,
      generatedTokens: i.stats.generatedTokens,
      promptMs: i.stats.promptMs,
      generationMs: i.stats.generationMs,
    },
    stopReason: i.stats?.stopReason,
    scriptLogs: i.scriptLogs ?? [],
    ...(i.scriptCache ? { scriptCache: i.scriptCache } : {}),
    timings: { totalMs: i.totalMs, ttftMs: i.ttftMs },
    overlap: overlappingJobs(i.createdAt, i.createdAt + i.totalMs),
  };
}
