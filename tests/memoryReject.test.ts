import { describe, expect, it, vi } from 'vitest';
import { createMemory, skippedMemory } from '@core/memory/memoryBank';
import { isMemoryLike, runMemoryMaintenance } from '@core/memory/memoryJobs';
import type { CompletionRequest } from '@core/ports';
import { joinStory } from '@core/text/formatting';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure as adventure } from './fixtures/memoryJobs';

describe('rejected memories', () => {
  it('rejects a memory that copies its passage, then keeps the retry', async () => {
    const adv = adventure(12);
    const passage = joinStory(adv.actions.slice(0, 5));
    const answers = [passage.split('\n')[0]!, 'Mira found the map.'];
    const provider = fakeProvider(async function* () {
      yield { text: answers.shift() ?? '', done: true };
    });
    const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(report).toMatchObject({ memoriesWritten: 1, memoriesRejected: 0 });
    expect(adv.memories[0]?.text).toBe('Mira found the map.');
    expect(isMemoryLike('Mira found the map by the old gate at night.', 'Mira found the map by the old gate at night and ran.')).toBe(false);
  });

  it('rejects memories that continue the story, retries once, then skips the range for good', async () => {
    const adv = adventure(18);
    const answers = ['"Halt!" the rider cries.', 'The rider halts. > You draw.', 'Mira found the map.'];
    const reqs: CompletionRequest[] = [];
    const provider = fakeProvider(async function* (req) {
      reqs.push(req);
      yield { text: answers.shift() ?? '', done: true };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const deps = { ...fakeDeps(adv).deps, provider };
    const report = await runMemoryMaintenance(adv, deps);
    expect(report).toMatchObject({ memoriesWritten: 1, memoriesSkipped: 1, memoriesRejected: 1 });
    expect(warn).toHaveBeenCalledOnce();
    expect(reqs).toHaveLength(3);
    expect(reqs[0]).toMatchObject({ maxTokens: 120, stop: expect.arrayContaining(['\n>', '<|im_start|>']) });
    expect(adv.memories.map((m) => [m.fromAction, m.toAction, m.text, !!m.skipped])).toEqual([
      [0, 6, '', true],
      [6, 12, 'Mira found the map.', false],
    ]);
    for (const _ of [1, 2]) expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesWritten: 0, memoriesSkipped: 0 });
    expect(reqs).toHaveLength(3);
    warn.mockRestore();
  });

  it('counts a verbatim copy as a rejection', async () => {
    const adv = adventure(12);
    const provider = fakeProvider(async function* () {
      yield { text: joinStory(adv.actions.slice(0, 6)), done: true };
    });
    vi.spyOn(console, 'warn').mockImplementationOnce(() => undefined);
    expect(await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider })).toMatchObject({ memoriesSkipped: 1, memoriesRejected: 1 });
    expect(adv.memories[0]).toMatchObject({ skipped: true, text: '' });
  });

  it('rewrites a skipped memory the player retries, keeping its id', async () => {
    const adv = adventure(12);
    adv.memories = [{ ...skippedMemory(adv.actions, { fromAction: 0, toAction: 6 }), id: 'mem_s', stale: true }];
    const { deps, calls } = fakeDeps(adv);
    expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesRegenerated: 1, memoriesWritten: 0 });
    expect(calls).toHaveLength(1);
    expect(adv.memories).toHaveLength(1);
    expect(adv.memories[0]).toMatchObject({ id: 'mem_s', text: 'sum:text' });
    expect(adv.memories[0]?.skipped).toBeUndefined();
    expect(adv.memories[0]?.stale).toBeUndefined();
  });

  it('skips a stale memory copied twice instead of retrying it every run', async () => {
    const adv = adventure(12);
    adv.memories = [{ ...createMemory('Mira found the map.', adv.actions, { fromAction: 0, toAction: 6 }), id: 'mem_s', stale: true, useCount: 2 }];
    let calls = 0;
    const provider = fakeProvider(async function* () {
      calls += 1;
      yield { text: '"Halt!" the rider cries.', done: true };
    });
    vi.spyOn(console, 'warn').mockImplementationOnce(() => undefined);
    const deps = { ...fakeDeps(adv).deps, provider };
    expect(await runMemoryMaintenance(adv, deps)).toMatchObject({ memoriesSkipped: 1, memoriesRegenerated: 0 });
    expect(adv.memories[0]).toMatchObject({ id: 'mem_s', useCount: 2, text: '', skipped: true });
    expect(adv.memories[0]?.stale).toBeUndefined();
    await runMemoryMaintenance(adv, deps);
    expect(calls).toBe(2);
  });

  it('still reads entities over skipped ranges', async () => {
    const adv = adventure(24);
    const prompts: string[] = [];
    const provider = fakeProvider(async function* (req) {
      prompts.push(req.prompt);
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? '{}' : '"Halt!" the rider cries.', done: true };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    warn.mockRestore();
    expect(adv.memories.filter((m) => m.skipped)).toHaveLength(3);
    expect(prompts.filter((p) => p.includes(ENTITY_PROMPT))).toHaveLength(1);
    expect(adv.scriptState.__entitiesAt).toBe(18);
  });
});
