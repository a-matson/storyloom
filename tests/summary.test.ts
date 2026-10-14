import { describe, expect, it } from 'vitest';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { coveredEnd } from '@core/memory/summary';
import type { Memory } from '@core/model';
import { SUMMARY_SYSTEM } from '@core/text/memoryPrompts';
import { ENTITY_PROMPT, fakeDeps, memoryAdventure as adventure } from './fixtures/memoryJobs';

const SUMMARY = 'Write the updated summary';

function memories(froms: number[]): Memory[] {
  return froms.map((from) => ({ id: `m${from}`, text: `mem${from}`, fromAction: from, toAction: from + 6, actionIds: [], useCount: 0, createdAt: from }));
}

describe('story summary', () => {
  it('runs an overdue summary before the memories, and a merely due one after them', async () => {
    const order = async (summaryAt: number) => {
      const adv = adventure(30);
      adv.settings.memory.autoSummary = true;
      adv.scriptState = { ...adv.scriptState, __summaryAt: summaryAt };
      adv.memories = memories([0, 6, 12]);
      const { deps, calls } = fakeDeps(adv);
      const report = await runMemoryMaintenance(adv, { ...deps, historyStart: 18 });
      return { report, kinds: calls.map((c) => (c.includes(SUMMARY) ? 'summary' : c.includes(ENTITY_PROMPT) ? 'entity' : 'memory')) };
    };
    const overdue = await order(0);
    expect(overdue.report).toMatchObject({ summaryFirst: true, summaryUpdated: true });
    expect(overdue.kinds[0]).toBe('summary');
    expect(overdue.kinds.filter((k) => k === 'summary')).toHaveLength(1);
    const due = await order(8);
    expect(due.report).toMatchObject({ summaryFirst: false, summaryUpdated: true });
    expect(due.kinds.at(-1)).toBe('summary');
    expect(due.kinds[0]).toBe('memory');
  });

  it('rebuilds a dirty summary from every memory, without its old text, before it is due', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    adv.plot.storySummary = 'OLD SUMMARY';
    adv.scriptState = { ...adv.scriptState, __summaryAt: 23, __summaryDirty: true };
    const report = await runMemoryMaintenance(adv, { ...deps, historyStart: 30 });
    expect(report.summaryUpdated).toBe(true);
    expect(calls.at(-1)).not.toContain('OLD SUMMARY');
    expect(calls.at(-1)).toContain(`- ${adv.memories[0]?.text}`);
    expect(adv.scriptState.__summaryDirty).toBe(false);
  });

  it('regenerates a stale memory before an overdue summary reads it', async () => {
    const adv = adventure(30);
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    adv.settings.memory.autoSummary = true;
    adv.memories = adv.memories.map((m, i) => (i === 0 ? { ...m, stale: true } : m));
    adv.actions = adv.actions.map((a, i) => (i === 3 ? { ...a, versions: ['EDITED'], active: 0 } : a));
    const before = calls.length;
    expect(await runMemoryMaintenance(adv, { ...deps, historyStart: 18 })).toMatchObject({ summaryFirst: true, memoriesRegenerated: 1 });
    const summary = calls.slice(before).find((c) => c.includes(SUMMARY));
    expect(summary).toContain('- sum:EDITED');
  });

  it('feeds the summary the memories of text evicted since its last refresh, and no passage', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    adv.scriptState = { ...adv.scriptState, __summaryAt: 6 };
    adv.memories = memories([0, 6, 12, 18]);
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, { ...deps, historyStart: 18 });
    expect(calls.at(-1)).toContain(`- mem6\n- mem12\n\n${SUMMARY}:`);
    for (const absent of ['mem0', 'mem18', 'Most recent passage']) expect(calls.at(-1)).not.toContain(absent);
    expect(adv.scriptState.__summaryAt).toBe(18);
  });

  it('leaves the summary alone until text is evicted, and stops where the memories stop', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    adv.memories = memories([0, 6]);
    expect(coveredEnd(adv, undefined)).toBe(0);
    expect(coveredEnd(adv, 9)).toBe(9);
    expect(coveredEnd(adv, 40)).toBe(12);
    const { deps, calls } = fakeDeps(adv);
    expect((await runMemoryMaintenance(adv, deps)).summaryUpdated).toBe(false);
    expect(calls.some((c) => c.includes(SUMMARY))).toBe(false);
  });

  it('builds the next summary on top of the player-edited one', async () => {
    const adv = adventure(18);
    adv.settings.memory.autoSummary = true;
    adv.plot.storySummary = 'The player rewrote this: Mira owes the ferryman.';
    const { deps, calls } = fakeDeps(adv);
    const report = await runMemoryMaintenance(adv, { ...deps, historyStart: 14 });
    expect(report.summaryUpdated).toBe(true);
    expect(calls.at(-1)).toContain('Current summary:\nThe player rewrote this: Mira owes the ferryman.');
    // the newest memory ends short of the history start
    expect(adv.memories.at(-1)?.toAction).toBe(12);
    expect(adv.scriptState.__summaryAt).toBe(12);
  });

  it('asks the summary to extend, keep every event, and split long ago from recently', () => {
    expect(SUMMARY_SYSTEM).toContain('keep every earlier event; do not drop details');
    expect(SUMMARY_SYSTEM).toContain('"Long ago:" (at most 6 sentences) then "Recently:" (at most 6 sentences)');
    expect(SUMMARY_SYSTEM).not.toContain('no longer matter');
  });
});
