import { describe, expect, it, vi } from 'vitest';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { actionText } from '@core/model';
import type { CompletionRequest, Provider } from '@core/ports';
import { memoryPrompt } from '@core/text/prompts';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure as adventure } from './fixtures/memoryJobs';

describe('memory maintenance', () => {
  it('rewrites a stale memory from the edited text, keeping its id and use count', async () => {
    const adv = adventure(30);
    const { deps } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    const first = adv.memories[0]!;
    adv.memories = adv.memories.map((m) => (m.id === first.id ? { ...m, stale: true, useCount: 3 } : m));
    adv.actions = adv.actions.map((a, i) => (i === 3 ? { ...a, versions: ['EDITED'], active: 0 } : a));
    expect(actionText(adv.actions[3]!)).toBe('EDITED');
    const report = await runMemoryMaintenance(adv, deps);
    expect(report).toMatchObject({ memoriesRegenerated: 1, memoriesWritten: 0 });
    expect(adv.memories[0]).toMatchObject({ id: first.id, text: 'sum:EDITED', useCount: 3, fromAction: 0, toAction: 6 });
    expect(adv.memories[0]?.stale).toBeUndefined();
  });

  it('drops a stale memory whose actions were erased', async () => {
    const adv = adventure(30);
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    const last = adv.memories.at(-1)!;
    adv.memories = adv.memories.map((m) => (m.id === last.id ? { ...m, stale: true } : m));
    adv.actions = adv.actions.slice(0, last.fromAction + 2);
    const memoryCalls = () => calls.filter((c) => !c.includes(ENTITY_PROMPT)).length;
    const before = memoryCalls();
    const report = await runMemoryMaintenance(adv, deps);
    expect(report.memoriesDropped).toBe(1);
    expect(adv.memories.some((m) => m.id === last.id)).toBe(false);
    expect(memoryCalls()).toBe(before);
  });

  it('rewrites at most two stale memories per run and stops when aborted', async () => {
    const adv = adventure(42);
    await runMemoryMaintenance(adv, fakeDeps(adv).deps);
    adv.memories = adv.memories.map((m) => ({ ...m, stale: true }));
    expect((await runMemoryMaintenance(adv, fakeDeps(adv).deps)).memoriesRegenerated).toBe(2);
    expect(adv.memories.filter((m) => m.stale)).toHaveLength(4);
    const aborting = fakeDeps(adv, { abortAfter: 1 });
    await runMemoryMaintenance(adv, aborting.deps);
    expect(aborting.calls).toHaveLength(1);
    expect(adv.memories.filter((m) => m.stale)).toHaveLength(3);
  });

  it('lets a streaming memory call finish when aborted, then defers the rest and the summary', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    adv.scriptState = { ...adv.scriptState, __summaryAt: 15 };
    const { deps, calls } = fakeDeps(adv, { abortAfter: 1 });
    const report = await runMemoryMaintenance(adv, deps);
    expect(calls).toHaveLength(1);
    expect(report).toMatchObject({ memoriesWritten: 1, summaryUpdated: false });
  });

  it('cuts a streaming memory call when cancelled and keeps nothing from it', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    adv.scriptState = { ...adv.scriptState, __summaryAt: 15 };
    const { deps, calls } = fakeDeps(adv, { cancelAfter: 1 });
    const report = await runMemoryMaintenance(adv, deps);
    expect(calls).toHaveLength(1);
    expect(report).toMatchObject({ memoriesWritten: 0, summaryUpdated: false, cutCalls: 1, finishedPastCut: 0 });
    expect(adv.memories).toHaveLength(0);
  });

  it('keeps a memory call typed over past half its tokens, and cuts one typed over at a fifth', async () => {
    const run = async (cutAt: number) => {
      const adv = adventure(12);
      const cancel = new AbortController();
      const provider = fakeProvider(async function* (req) {
        for (let i = 1; i <= 10; i++) {
          if (i === cutAt) cancel.abort();
          yield { text: i === 1 ? 'Mira found the map.' : '', done: false, stats: { generatedTokens: (req.maxTokens * i) / 10 } };
        }
        yield { text: '', done: true };
      });
      const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider, signal: cancel.signal, cancel: cancel.signal });
      return { report, memories: adv.memories };
    };
    const late = await run(7);
    expect(late.report).toMatchObject({ memoriesWritten: 1, cutCalls: 0, finishedPastCut: 1 });
    expect(late.memories[0]?.text).toBe('Mira found the map.');
    const early = await run(3);
    expect(early.report).toMatchObject({ memoriesWritten: 0, cutCalls: 1, finishedPastCut: 0 });
    expect(early.memories).toHaveLength(0);
  });

  it('runs an overdue summary before the memories, and a merely due one after them', async () => {
    const order = async (summaryAt: number) => {
      const adv = adventure(30);
      adv.settings.memory.autoSummary = true;
      adv.scriptState = { ...adv.scriptState, __summaryAt: summaryAt };
      const { deps, calls } = fakeDeps(adv);
      const report = await runMemoryMaintenance(adv, deps);
      return { report, kinds: calls.map((c) => (c.includes('Write the updated summary') ? 'summary' : c.includes(ENTITY_PROMPT) ? 'entity' : 'memory')) };
    };
    const overdue = await order(0);
    expect(overdue.report).toMatchObject({ summaryFirst: true, summaryUpdated: true });
    expect(overdue.kinds[0]).toBe('summary');
    expect(overdue.kinds.filter((k) => k === 'summary')).toHaveLength(1);
    const due = await order(15);
    expect(due.report).toMatchObject({ summaryFirst: false, summaryUpdated: true });
    expect(due.kinds.at(-1)).toBe('summary');
    expect(due.kinds[0]).toBe('memory');
  });

  it('never summarises an evicted range twice on a long adventure', async () => {
    const adv = adventure(400, 25);
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    const memoryCalls = () => calls.filter((c) => !c.includes(ENTITY_PROMPT)).length;
    expect(memoryCalls()).toBe(65);
    expect(adv.memories.filter((m) => !m.forgotten)).toHaveLength(25);
    expect(adv.memories.filter((m) => m.forgotten)).toHaveLength(25);
    await runMemoryMaintenance(adv, deps);
    expect(memoryCalls()).toBe(65);
  });

  it('feeds the summary every memory since the previous recent passage', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    adv.scriptState = { ...adv.scriptState, __summaryAt: 15 };
    adv.memories = [0, 6, 12, 18].map((from) => ({
      id: `m${from}`,
      text: `mem${from}`,
      fromAction: from,
      toAction: from + 6,
      actionIds: [],
      useCount: 0,
      createdAt: from,
    }));
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    // the refresh at 15 saw actions 9-14 as its recent passage, so mem6 still counts
    expect(calls.at(-1)).toContain('- mem6\n- mem12\n- mem18');
    expect(calls.at(-1)).not.toContain('mem0');
  });

  it('rejects memories that continue the story, retries once, then skips the range', async () => {
    const adv = adventure(12);
    const answers = ['"Halt!" the rider cries.', 'The rider halts. > You draw.', 'Mira found the map.'];
    const reqs: CompletionRequest[] = [];
    const provider = fakeProvider(async function* (req) {
      reqs.push(req);
      yield { text: answers.shift() ?? '', done: true };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const deps = { ...fakeDeps(adv).deps, provider };
    const report = await runMemoryMaintenance(adv, deps);
    expect(report).toMatchObject({ memoriesWritten: 0, memoriesRejected: 1 });
    expect(warn).toHaveBeenCalledOnce();
    expect(reqs[0]).toMatchObject({ maxTokens: 120, stop: expect.arrayContaining(['\n>', '<|im_start|>']) });
    expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesWritten: 1, memoriesRejected: 0 });
    expect(adv.memories[0]?.text).toBe('Mira found the map.');
    warn.mockRestore();
  });

  it('trims a length-cut memory and summary to their last sentence end', async () => {
    const adv = adventure(15);
    adv.settings.memory.autoSummary = true;
    const provider = fakeProvider(async function* (req) {
      const text = req.prompt.includes('Write the updated summary') ? 'Mira owes the ferryman. She hid the' : 'Mira found the map. The rider ha';
      yield { text, done: true, stats: { stopReason: 'length' } };
    });
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.memories[0]?.text).toBe('Mira found the map.');
    expect(adv.plot.storySummary).toBe('Mira owes the ferryman.');
  });

  it('asks the memory to keep what the player states about themselves, with no worked example', () => {
    const prompt = memoryPrompt('> You show the guard the scar on your cheek.');
    expect(prompt).toContain('anything the player states about themselves (name, body, belongings, past)');
    for (const word of ['Dunmere', 'copper ring', 'two pennies', 'loft above the stables', 'snowed in', 'Example']) expect(prompt).not.toContain(word);
  });

  it('keeps a memory as written, even one naming a place the passage lacks', async () => {
    const adv = adventure(15);
    const text = 'Mira found the map. You walked from Dunmere to sell your songs. The rider left.';
    const provider = fakeProvider(async function* () {
      yield { text, done: true };
    });
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(adv.memories[0]?.text).toBe(text);
  });

  it('constrains memories to 4 and the summary to 8 sentences when the backend has grammar', async () => {
    const adv = adventure(15);
    adv.settings.memory.autoSummary = true;
    const reqs: CompletionRequest[] = [];
    const answer: Provider['complete'] = async function* (req) {
      reqs.push(req);
      yield { text: 'Mira found the map.', done: true };
    };
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider: fakeProvider(answer, true) });
    expect(reqs[0]?.prompt).toContain('Memory:');
    expect(reqs[0]?.grammar).toMatchInlineSnapshot(`
      "root ::= sentence{1,4}
      sentence ::= [^.!?"“”\\n> ] [^.!?"“”\\n>]* [.!?] " "?
      "
    `);
    expect(reqs.at(-1)?.grammar).toContain('root ::= sentence{1,8}');
    reqs.length = 0;
    await runMemoryMaintenance(adventure(15), { ...fakeDeps(adv).deps, provider: fakeProvider(answer, false) });
    expect(reqs[0]?.grammar).toBeUndefined();
  });

  it('builds the next summary on top of the player-edited one', async () => {
    const adv = adventure(15);
    adv.settings.memory.autoSummary = true;
    adv.plot.storySummary = 'The player rewrote this: Mira owes the ferryman.';
    const { deps, calls } = fakeDeps(adv);
    const report = await runMemoryMaintenance(adv, deps);
    expect(report.summaryUpdated).toBe(true);
    expect(calls.at(-1)).toContain('Current summary:\nThe player rewrote this: Mira owes the ferryman.');
    expect(adv.scriptState.__summaryAt).toBe(adv.actions.length);
  });
});
