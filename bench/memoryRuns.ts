import type { Page } from '@playwright/test';
import { z } from 'zod/mini';

const Rejected = z.object({
  entity: z.string(),
  value: z.string(),
  reason: z.string(),
  passageRange: z.object({ fromAction: z.number(), toAction: z.number() }),
});
const MemoryRun = z.object({
  summaryUpdated: z.boolean(),
  summaryFirst: z.boolean(),
  cutCalls: z.number(),
  finishedPastCut: z.number(),
  factsProposed: z.number(),
  rejected: z.array(Rejected),
  entityCalls: z.array(z.object({ cut: z.boolean(), generatedTokens: z.number(), factsProposed: z.optional(z.number()) })),
});

/**
 * Sums the scheduler's `memory run {…}` console lines: summaries written (and how many went first),
 * helper calls cut or kept past half, trait facts the entity call proposed and the values its guards
 * dropped (each, and a count by reason), and each entity call: cut, tokens, facts proposed.
 */
export function watchMemoryRuns(page: Page) {
  const rejectedBy: Record<string, number> = {};
  const rejected: z.infer<typeof Rejected>[] = [];
  const entityCalls: z.infer<typeof MemoryRun>['entityCalls'] = [];
  const sum = { summaryUpdated: 0, summaryFirst: 0, cutCalls: 0, finishedPastCut: 0, factsProposed: 0, rejectedBy, rejected, entityCalls };
  page.on('console', (m) => {
    const json = /^memory run (.*)$/.exec(m.text())?.[1];
    if (!json) return;
    const r = MemoryRun.parse(JSON.parse(json));
    sum.summaryUpdated += +r.summaryUpdated;
    sum.summaryFirst += +(r.summaryFirst && r.summaryUpdated);
    sum.cutCalls += r.cutCalls;
    sum.finishedPastCut += r.finishedPastCut;
    sum.factsProposed += r.factsProposed;
    for (const x of r.rejected) rejectedBy[x.reason] = (rejectedBy[x.reason] ?? 0) + 1;
    rejected.push(...r.rejected);
    entityCalls.push(...r.entityCalls);
  });
  return sum;
}
