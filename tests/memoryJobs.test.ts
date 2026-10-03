import { describe, expect, it, vi } from 'vitest';
import type { MaintenanceDeps } from '@core/memory';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { actionText, type Adventure } from '@core/model';
import type { CompletionRequest, Embedder, Provider } from '@core/ports';
import { makeAdventure } from './fixtures/adventure';

function fakeProvider(complete: Provider['complete'], grammar = false): Provider {
  return { id: 'fake', complete, capabilities: () => Promise.resolve({ grammar }) } as unknown as Provider;
}

/** Answers every memory prompt with "sum:<first word of the passage>" and counts calls. */
function fakeDeps(adv: Adventure, opts: { abortAfter?: number; cancelAfter?: number } = {}) {
  const calls: string[] = [];
  const ac = new AbortController();
  const cc = new AbortController();
  const provider = {
    id: 'fake',
    capabilities: () => Promise.resolve({ grammar: false }),
    async *complete(req: CompletionRequest, signal?: AbortSignal) {
      calls.push(req.prompt);
      if (calls.length === opts.abortAfter) ac.abort();
      if (calls.length === opts.cancelAfter) cc.abort();
      // The SSE reader ends quietly mid-reply when its signal fires.
      if (signal?.aborted) {
        yield { text: 'The ferryman' };
        return;
      }
      const passage = req.prompt.match(/EDITED|\w+/g)?.find((w) => w === 'EDITED') ?? 'text';
      yield { text: `sum:${passage}`, done: true };
    },
  } as unknown as Provider;
  const embedder: Embedder = { id: 'e', dimensions: 2, embed: (texts) => Promise.resolve(texts.map(() => [1, 0])) };
  const deps: MaintenanceDeps = { provider, embedder, template: adv.settings.template, signal: AbortSignal.any([ac.signal, cc.signal]), cancel: cc.signal };
  return { deps, calls };
}

function adventure(actions: number, bankSize = 200): Adventure {
  const adv = makeAdventure({ actions, cards: 0 });
  adv.settings.memory = { ...adv.settings.memory, memoryBank: true, autoSummary: false, bankSize };
  return adv;
}

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
    const before = calls.length;
    const report = await runMemoryMaintenance(adv, deps);
    expect(report.memoriesDropped).toBe(1);
    expect(adv.memories.some((m) => m.id === last.id)).toBe(false);
    expect(calls.length).toBe(before);
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
    const { deps, calls } = fakeDeps(adv, { abortAfter: 1 });
    const report = await runMemoryMaintenance(adv, deps);
    expect(calls).toHaveLength(1);
    expect(report).toMatchObject({ memoriesWritten: 1, summaryUpdated: false });
  });

  it('cuts a streaming memory call when cancelled and keeps nothing from it', async () => {
    const adv = adventure(30);
    adv.settings.memory.autoSummary = true;
    const { deps, calls } = fakeDeps(adv, { cancelAfter: 1 });
    const report = await runMemoryMaintenance(adv, deps);
    expect(calls).toHaveLength(1);
    expect(report).toMatchObject({ memoriesWritten: 0, summaryUpdated: false });
    expect(adv.memories).toHaveLength(0);
  });

  it('never summarises an evicted range twice on a long adventure', async () => {
    const adv = adventure(400, 25);
    const { deps, calls } = fakeDeps(adv);
    await runMemoryMaintenance(adv, deps);
    expect(calls).toHaveLength(65);
    expect(adv.memories.filter((m) => !m.forgotten)).toHaveLength(25);
    expect(adv.memories.filter((m) => m.forgotten)).toHaveLength(25);
    await runMemoryMaintenance(adv, deps);
    expect(calls).toHaveLength(65);
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
    expect(reqs[0]).toMatchObject({ maxTokens: 90, stop: expect.arrayContaining(['\n>', '<|im_start|>']) });
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

  it('constrains memories to 3 and the summary to 8 sentences when the backend has grammar', async () => {
    const adv = adventure(15);
    adv.settings.memory.autoSummary = true;
    const reqs: CompletionRequest[] = [];
    const answer: Provider['complete'] = async function* (req) {
      reqs.push(req);
      yield { text: 'Mira found the map.', done: true };
    };
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider: fakeProvider(answer, true) });
    expect(reqs[0]?.prompt).toContain('Memory: You paid the ferryman');
    expect(reqs[0]?.grammar).toMatchInlineSnapshot(`
      "root ::= sentence{1,3}
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
