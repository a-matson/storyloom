import { z } from 'zod/mini';
import { GenerationStats } from './action';

export const TurnKind = z.enum(['turn', 'retry']);
export const TurnOutcome = z.enum(['done', 'stopped', 'error']);
export const TurnErrorKind = z.enum(['provider', 'storage', 'script', 'cancelled', 'unknown']);

const count = z.int().check(z.gte(0));

/** Everything needed to explain one generation afterwards: what was sent, with which settings, what came back. */
export const TurnTrace = z.object({
  turnId: z.string(),
  adventureId: z.string(),
  /** The AI action this turn produced or re-rolled; absent when the turn failed before one existed. */
  actionId: z.optional(z.string()),
  kind: TurnKind,
  createdAt: z.number(),
  outcome: TurnOutcome,
  errorKind: z.optional(TurnErrorKind),
  /** Hash of the full prompt; `prompt` below may be cut. */
  promptHash: z.string(),
  prompt: z.string(),
  promptChars: count,
  promptTruncated: z.boolean(),
  sections: z.array(z.object({ kind: z.string(), tokens: count, cacheable: z.boolean(), trimmed: z.boolean() })),
  budget: z.record(z.string(), z.number()),
  triggeredCardIds: z.array(z.string()),
  droppedCardIds: z.array(z.string()),
  memoryIds: z.array(z.string()),
  historyRange: z.nullable(z.object({ from: count, to: count })),
  droppedSections: z.array(z.string()),
  warnings: z.array(z.string()),
  sampler: z.object({
    maxTokens: count,
    temperature: z.number(),
    topK: z.optional(z.number()),
    topP: z.optional(z.number()),
    minP: z.optional(z.number()),
    presencePenalty: z.optional(z.number()),
    frequencyPenalty: z.optional(z.number()),
    repetitionPenalty: z.optional(z.number()),
    seed: z.optional(z.number()),
    stop: z.array(z.string()),
  }),
  template: z.string(),
  providerId: z.string(),
  modelId: z.optional(z.string()),
  stats: z.optional(GenerationStats),
  /** Why generation ended (`length` means the reply was cut off). */
  stopReason: z.optional(z.string()),
  scriptLogs: z.array(z.string()),
  timings: z.object({ totalMs: count, ttftMs: z.optional(count) }),
});
