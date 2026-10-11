import type { Page } from '@playwright/test';
import { z } from 'zod/mini';

const MemoryRun = z.object({ summaryUpdated: z.boolean(), summaryFirst: z.boolean(), cutCalls: z.number(), finishedPastCut: z.number() });

/** Sums the scheduler's `memory run {…}` console lines: summaries written (and how many went first), helper calls cut or kept past half. */
export function watchMemoryRuns(page: Page) {
  const sum = { summaryUpdated: 0, summaryFirst: 0, cutCalls: 0, finishedPastCut: 0 };
  page.on('console', (m) => {
    const json = /^memory run (.*)$/.exec(m.text())?.[1];
    if (!json) return;
    const r = MemoryRun.parse(JSON.parse(json));
    sum.summaryUpdated += +r.summaryUpdated;
    sum.summaryFirst += +(r.summaryFirst && r.summaryUpdated);
    sum.cutCalls += r.cutCalls;
    sum.finishedPastCut += r.finishedPastCut;
  });
  return sum;
}
