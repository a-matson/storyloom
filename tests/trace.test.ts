import { describe, expect, it } from 'vitest';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { ActionLog } from '@core/log';
import { mergeEntity } from '@core/memory/entities';
import { createBlankAdventure, type TurnTrace } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult } from '@core/ports';
import * as S from '@core/schema';
import { createApproxTokenizer } from '@core/text';
import { buildTrace, clearJobLog, hashPrompt, overlappingJobs, TRACE_PROMPT_CAP, trackJob } from '@core/trace';
import { runTurn, type TurnEvent } from '@core/turn';

async function oneTurn() {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  const events: TurnEvent[] = [];
  for await (const e of runTurn(adventure, new ActionLog(adventure.actions), { type: 'do', text: 'wait' }, { provider, tokenizer: createApproxTokenizer() }))
    events.push(e);
  const context = events.find((e) => e.type === 'context');
  const trace = events.find((e) => e.type === 'trace');
  if (context?.type !== 'context' || trace?.type !== 'trace') throw new Error('turn produced no context or trace');
  return { adventure, context, trace: trace.trace };
}

describe('TurnTrace schema', () => {
  it('accepts a trace built from a real turn and rejects damaged ones', async () => {
    const { trace } = await oneTurn();
    expect(S.TurnTrace.parse(structuredClone(trace))).toEqual(trace);
    expect(S.TurnTrace.safeParse({ ...trace, kind: 'bogus' }).success).toBe(false);
    expect(S.TurnTrace.safeParse({ ...trace, sections: [{ kind: 'history', tokens: -1, cacheable: true, trimmed: false }] }).success).toBe(false);
    expect(S.TurnTrace.safeParse({ ...trace, promptHash: undefined }).success).toBe(false);
  });
});

describe('hashPrompt', () => {
  it('is stable and changes with one character', () => {
    expect(hashPrompt('abc')).toBe(hashPrompt('abc'));
    expect(hashPrompt('abc')).not.toBe(hashPrompt('abd'));
    expect(hashPrompt('')).toMatch(/^[0-9a-f]+$/);
  });
});

describe('job log', () => {
  it('attributes only the jobs whose window overlaps the turn, with the overlapping ms', async () => {
    clearJobLog();
    let release = () => {};
    const held = trackJob('memory', () => new Promise<void>((ok) => (release = ok)));
    const from = Date.now();
    await trackJob('card', () => new Promise((ok) => setTimeout(ok, 20)));
    const to = Date.now();
    release();
    await held;
    await trackJob('summary', () => Promise.resolve()); // after the turn: not attributed
    const jobs = overlappingJobs(from, to);
    expect(jobs.map((j) => j.job).toSorted()).toEqual(['card', 'memory']);
    expect(jobs.find((j) => j.job === 'card')?.ms).toBeGreaterThan(0);
    expect(overlappingJobs(to + 1000, to + 2000)).toEqual([]);
  });

  it('closes the window of a job that throws and counts it as failed', async () => {
    clearJobLog();
    const from = Date.now();
    // A window needs width to be attributed at all, so the failure takes a few ms.
    const job = trackJob('image', async () => {
      await new Promise((ok) => setTimeout(ok, 20));
      throw new Error('no model loaded');
    });
    await expect(job).rejects.toThrow('no model loaded');
    const jobs = overlappingJobs(from, Date.now());
    expect(jobs).toEqual([{ job: 'image', ms: expect.any(Number), failed: 1 }]);
  });
});

describe('buildTrace', () => {
  it('caps the stored prompt but hashes and counts the whole of it', async () => {
    const { adventure, context, trace } = await oneTurn();
    const prompt = `${'x'.repeat(TRACE_PROMPT_CAP)}TAIL`;
    const big = buildTrace({
      turnId: 't',
      kind: 'turn',
      adventureId: adventure.id,
      createdAt: 0,
      outcome: 'done',
      result: context.result,
      prompt,
      request: { prompt, maxTokens: 1, temperature: 1 },
      template: 'chatml',
      providerId: 'demo',
      totalMs: 1,
    });
    expect(big.promptTruncated).toBe(true);
    expect(big.prompt.length).toBe(TRACE_PROMPT_CAP);
    expect(big.prompt.endsWith('TAIL')).toBe(true);
    expect(big.promptChars).toBe(prompt.length);
    expect(big.promptHash).toBe(hashPrompt(prompt));
    expect(trace.promptTruncated).toBe(false);
  });

  it('lists the projected entities in the prompt, not plain story cards, and hands them to two hooks', async () => {
    const handler = createFakeLlama({ wordDelayMs: 0 });
    const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
    const adventure = createBlankAdventure('Test', 'You stand at the gate with Tamsin.');
    // Seen in two ranges: one sighting never reaches the prompt.
    const tamsin = {
      ...mergeEntity(undefined, { name: 'Tamsin', kind: 'character', aliases: [], description: 'Tamsin rows.', facts: ['She owes a debt.'] }, 0),
      lastSeen: 1,
    };
    const absent = mergeEntity(undefined, { name: 'Orrin', kind: 'character', aliases: [], description: 'Orrin sleeps.', facts: [] }, 0);
    adventure.entities = [tamsin, absent];
    adventure.storyCards = [{ id: 'card_gate', type: 'location', name: 'Gate', entry: 'An iron gate.', triggers: ['gate'] }];
    const seen = new Map<string, HookInput['entities']>();
    const scripts = new (class extends NoopScriptRunner {
      override run(input: HookInput): Promise<HookResult> {
        seen.set(input.hook, input.entities);
        return super.run(input);
      }
    })();
    let trace: TurnTrace | undefined;
    for await (const e of runTurn(
      adventure,
      new ActionLog(adventure.actions),
      { type: 'do', text: 'wait' },
      { provider, tokenizer: createApproxTokenizer(), scripts },
    ))
      if (e.type === 'trace') trace = e.trace;
    expect(trace?.triggeredCardIds).toContain('card_gate');
    expect(trace?.entitiesUsed).toEqual([tamsin.id]);
    expect(seen.has('onInput') && seen.get('onInput')).toBeUndefined();
    expect(seen.get('onModelContext')?.map((e) => e.name)).toEqual(['Tamsin', 'Orrin']);
    expect(seen.get('onOutput')?.[0]?.facts).toEqual(['She owes a debt.']);
  });
});
