import { describe, expect, it } from 'vitest';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { byPlayer } from '@core/memory/looks';
import { coveredEnd, refreshSummary } from '@core/memory/summary';
import { YOU } from '@core/memory/you';
import type { Memory } from '@core/model';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure as adventure } from './fixtures/memoryJobs';

const SUMMARY = 'Write what happened';

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
    // A skipped range adds no line, and does not hold the summary back.
    adv.memories = memories([0, 6, 12, 18]).map((m) => (m.fromAction === 12 ? { ...m, text: '', skipped: true } : m));
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, { ...deps, historyStart: 18 });
    expect(calls.at(-1)).toContain(`New memories:\n- mem6\n\n${SUMMARY}`);
    expect(calls.at(-1)).not.toContain('Events since');
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

  it('keeps the player-edited summary as the opening of Long ago, out of the prompt', async () => {
    const adv = adventure(18);
    adv.settings.memory.autoSummary = true;
    adv.plot.storySummary = 'The player rewrote this: Mira owes the ferryman.';
    const { deps, calls } = fakeDeps(adv);
    const report = await runMemoryMaintenance(adv, { ...deps, historyStart: 14 });
    expect(report.summaryUpdated).toBe(true);
    expect(calls.at(-1)).not.toContain('Mira owes the ferryman');
    expect(adv.plot.storySummary).toBe('Long ago: The player rewrote this: Mira owes the ferryman.\n\nRecently: sum:text');
    // the newest memory ends short of the history start
    expect(adv.memories.at(-1)?.toAction).toBe(12);
    expect(adv.scriptState.__summaryAt).toBe(12);
  });

  it('writes Recently from new text only, keeps the opening and retells the old Recently short', async () => {
    const adv = adventure(30);
    adv.scriptState = { ...adv.scriptState, __summaryAt: 6 };
    adv.memories = memories([0, 6, 12]);
    adv.plot.storySummary = 'Long ago: Met Tamsin. At the boat. In rain. Lost the map.\n\nRecently: Crossed the reef. Found the light.';
    const prompts: string[] = [];
    const provider = fakeProvider(async function* (req) {
      prompts.push(req.prompt);
      yield { text: req.prompt.includes(SUMMARY) ? 'Rang the bell.' : 'Reached the light.', done: true };
    });
    expect(await refreshSummary(adv, { provider, template: adv.settings.template, historyStart: 18 })).toBe(true);
    const [recent, era] = prompts;
    expect(recent).not.toMatch(/Tamsin|reef/);
    expect(era).toContain('Crossed the reef. Found the light.');
    expect(era).not.toContain('Tamsin');
    expect(adv.plot.storySummary).toBe('Long ago: Met Tamsin. At the boat. In rain. Reached the light.\n\nRecently: Rang the bell.');
  });

  it('writes Recently from the newest 6 memories of a long catch-up and retells the rest into Long ago', async () => {
    const adv = adventure(60);
    adv.memories = memories([0, 6, 12, 18, 24, 30, 36, 42]);
    const prompts: string[] = [];
    const provider = fakeProvider(async function* (req) {
      prompts.push(req.prompt);
      yield { text: req.prompt.includes(SUMMARY) ? 'Rang the bell.' : 'Met Tamsin.', done: true };
    });
    await refreshSummary(adv, { provider, template: adv.settings.template, historyStart: 48 });
    const [recent, era] = prompts;
    expect(recent).toContain('- mem12\n');
    expect(recent).not.toContain('mem6');
    expect(era).toContain('mem0 mem6');
    expect(era).not.toContain('mem12');
    expect(adv.plot.storySummary).toBe('Long ago: Met Tamsin.\n\nRecently: Rang the bell.');
  });

  it('gives the summary the events of the evicted text as lines before the memories', async () => {
    const adv = adventure(30);
    adv.scriptState = { ...adv.scriptState, __summaryAt: 6 };
    adv.memories = memories([0, 6, 12]);
    const event = (at: number, text: string) => byPlayer(YOU, at, { kind: 'event', text, who: [YOU] });
    adv.assertions = [event(13, 'You broke the oath.'), event(2, 'Too old.'), event(7, 'You met Tamsin.'), event(18, 'Still in history.')];
    const { deps, calls } = fakeDeps(adv);
    await refreshSummary(adv, { ...deps, historyStart: 18 });
    expect(calls[0]).toContain('Events since the last summary:\n- You met Tamsin.\n- You broke the oath.\n\nNew memories:');
    for (const absent of ['Too old', 'Still in history']) expect(calls[0]).not.toContain(absent);
  });
});
