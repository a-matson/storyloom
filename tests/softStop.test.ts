import { describe, expect, it } from 'vitest';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import type { CompletionChunk, CompletionRequest, Provider } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { runTurn, type TurnEvent } from '@core/turn';

/** Streams `tokens` one per chunk and records how far the consumer read. */
function scripted(tokens: string[]) {
  const seen = { request: undefined as CompletionRequest | undefined, read: 0 };
  const provider: Provider = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.reject(new Error('unused')),
    async *complete(req): AsyncIterable<CompletionChunk> {
      seen.request = req;
      for (const text of tokens) {
        seen.read++;
        yield { text, done: false, stats: { promptTokens: 40, cachedTokens: 30 } };
      }
      yield { text: '', done: true, stats: { stopReason: 'length' } };
    },
  };
  return { provider, seen };
}

async function play(tokens: string[], responseLength = 4) {
  const { provider, seen } = scripted(tokens);
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.settings.model.responseLength = responseLength;
  const events: TurnEvent[] = [];
  for await (const e of runTurn(adventure, new ActionLog(adventure.actions), { type: 'continue', text: '' }, { provider, tokenizer: createApproxTokenizer() }))
    events.push(e);
  const done = events.find((e) => e.type === 'done');
  const trace = events.find((e) => e.type === 'trace');
  return { seen, done: done?.type === 'done' ? done : undefined, trace: trace?.type === 'trace' ? trace.trace : undefined };
}

describe('soft stop', () => {
  it('asks for a margin past responseLength', async () => {
    const { seen } = await play(['A.']);
    expect(seen.request?.maxTokens).toBe(54);
  });

  it('stops at the first sentence end after responseLength and keeps the stream stats', async () => {
    const { seen, done, trace } = await play([' The', ' door', ' creaks', ' open', ' slowly', '.', ' Light', ' spills', ' out', '.', ' More']);
    expect(done?.text).toBe(' The door creaks open slowly.');
    expect(seen.read).toBe(7);
    expect(done?.stats).toMatchObject({ stopReason: 'soft', promptTokens: 40, cachedTokens: 30, generatedTokens: 7 });
    expect(trace?.stopReason).toBe('soft');
    expect(trace?.outcome).toBe('done');
  });

  it('does not count a sentence end from before responseLength', async () => {
    const { done } = await play([' Go', '.', ' The', ' door', ' opens', ' wide', '.', ' Then']);
    expect(done?.text).toBe(' Go. The door opens wide.');
  });

  it('does not stop inside open dialogue', async () => {
    const { done } = await play([' She', ' says', ',', ' "', 'Wait', '.', ' Stay', '."', ' Then', ' silence']);
    expect(done?.text).toBe(' She says, "Wait. Stay."');
  });

  it('falls back to length and the trim when no boundary comes', async () => {
    const { done } = await play([' One', ' two', '.', ' three', ' four', ' five']);
    expect(done?.text).toBe(' One two.');
    expect(done?.stats?.stopReason).toBe('length');
  });
});
