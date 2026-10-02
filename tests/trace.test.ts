import { describe, expect, it } from 'vitest';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import * as S from '@core/schema';
import { createApproxTokenizer } from '@core/text';
import { buildTrace, hashPrompt, TRACE_PROMPT_CAP } from '@core/trace';
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
});
