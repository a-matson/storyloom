import type { ContextBuildResult, ScriptCache } from '../context';
import type { TurnErrorKind, TurnKind, TurnOutcome, TurnTrace } from '../model/types';
import type { CompletionRequest, CompletionStats } from '../ports/provider';
import { tokenise } from '../memory/lexical';
import { repeatedPhrases } from '../text/repetition';
import { hashPrompt } from './hash';
import { overlappingJobs } from './jobLog';

/** Characters of prompt kept per trace. [provisional] */
export const TRACE_PROMPT_CAP = 64_000;
/** Characters of output kept per trace; a reply is ~1–3 k. [provisional] */
export const TRACE_OUTPUT_CAP = 8_000;

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
  output?: string | undefined;
  /** Active text of the AI outputs before this one, oldest first. */
  previousOutputs?: readonly string[] | undefined;
  error?: { message: string; status?: number | undefined } | undefined;
  gate?: TurnTrace['gate'];
}

/** What the output fields say about a reply; empty when there is none. */
function outputFields(output: string | undefined, previous: readonly string[]) {
  if (output === undefined) return {};
  return {
    output: output.slice(0, TRACE_OUTPUT_CAP),
    words: tokenise(output).length,
    paragraphs: output.split(/\n\s*\n/).filter((p) => p.trim()).length,
    repeatedPhrases: repeatedPhrases(output, previous),
  };
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
    entitiesUsed: result.usedEntityIds,
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
      repeatLastN: r.repeatLastN,
      dryMultiplier: r.dryMultiplier,
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
    ...(i.stats?.continued ? { continued: true } : {}),
    scriptLogs: i.scriptLogs ?? [],
    ...(i.scriptCache ? { scriptCache: i.scriptCache } : {}),
    timings: { totalMs: i.totalMs, ttftMs: i.ttftMs },
    overlap: overlappingJobs(i.createdAt, i.createdAt + i.totalMs),
    ...outputFields(i.output, i.previousOutputs ?? []),
    ...(i.gate ? { gate: i.gate } : {}),
    ...(i.error ? { error: i.error.status === undefined ? { message: i.error.message } : i.error } : {}),
  };
}
