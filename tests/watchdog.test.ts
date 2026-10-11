import { describe, expect, it } from 'vitest';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import type { Provider } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { runTurn, type TurnDeps, type TurnEvent } from '@core/turn';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

/** Waits `gaps[i]` ms before the i-th token; Infinity never sends it. */
function provider(gaps: number[]): Provider {
  return {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.reject(new Error('unused')),
    async *complete(_req, signal) {
      for (const [i, gap] of gaps.entries()) {
        await sleep(gap === Infinity ? 1e9 : gap, signal);
        yield { text: `word${i}. `, done: false };
      }
      yield { text: '', done: true, stats: { stopReason: 'length' } };
    },
  };
}

async function play(gaps: number[], signal?: AbortSignal): Promise<TurnEvent[]> {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  const deps: TurnDeps = { provider: provider(gaps), tokenizer: createApproxTokenizer(), ttftTimeoutMs: 50 };
  const out: TurnEvent[] = [];
  for await (const e of runTurn(adventure, new ActionLog(adventure.actions), { type: 'do', text: 'wait' }, deps, signal)) out.push(e);
  return out;
}

describe('first-token watchdog', () => {
  it('fails a stream that never starts as stalled, with a trace', async () => {
    const events = await play([Infinity]);
    const error = events.find((e) => e.type === 'error');
    expect(error?.type === 'error' && error.kind).toBe('stalled');
    expect(error?.type === 'error' && error.message).toContain('sent nothing');
    const trace = events.at(-1);
    expect(trace?.type === 'trace' && [trace.trace.outcome, trace.trace.errorKind]).toEqual(['error', 'stalled']);
  });

  it('leaves a stream that starts in time alone, however slow the next token', async () => {
    const events = await play([1, 120]);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('a player stop is still a stop, not a stall', async () => {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 10);
    const events = await play([Infinity], stop.signal);
    expect(events.some((e) => e.type === 'stopped')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
});
