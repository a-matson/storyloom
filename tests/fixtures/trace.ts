import type { TurnTrace } from '@core/model/types';
import { hashPrompt } from '@core/trace';

/** A minimal valid trace; pass what the test is about. */
export function makeTrace(over: Partial<TurnTrace> = {}): TurnTrace {
  const prompt = over.prompt ?? 'You stand at the gate.\n> You wait.\n';
  return {
    turnId: 't0',
    adventureId: 'adv1',
    kind: 'turn',
    createdAt: 0,
    outcome: 'done',
    promptHash: hashPrompt(prompt),
    promptChars: prompt.length,
    promptTruncated: false,
    sections: [{ kind: 'history', tokens: 12, cacheable: true, trimmed: false }],
    budget: { total: 4096, used: 12 },
    triggeredCardIds: [],
    droppedCardIds: [],
    memoryIds: [],
    historyRange: { from: 0, to: 1 },
    droppedSections: [],
    warnings: [],
    sampler: { maxTokens: 160, temperature: 0.9, stop: [] },
    template: 'chatml',
    providerId: 'demo',
    scriptLogs: [],
    timings: { totalMs: 5 },
    ...over,
    prompt,
  };
}
