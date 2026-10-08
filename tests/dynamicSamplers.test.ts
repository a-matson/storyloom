import { describe, expect, it } from 'vitest';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import type { CompletionRequest, Provider } from '@core/ports';
import { createApproxTokenizer, MODEL_PRESETS } from '@core/text';
import { runTurn } from '@core/turn';

function recording() {
  const requests: CompletionRequest[] = [];
  const provider: Provider = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.reject(new Error('unused')),
    async *complete(req) {
      requests.push(req);
      yield { text: 'The gate opens.', done: false };
      yield { text: '', done: true, stats: { stopReason: 'stop' } };
    },
  };
  return { provider, requests };
}

async function playTurns(dynamic: boolean, turns: number) {
  const { provider, requests } = recording();
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.settings.model.dynamic = dynamic;
  adventure.settings.model.temperature = 0.42;
  const log = new ActionLog(adventure.actions);
  for (let i = 0; i < turns; i++) {
    for await (const _ of runTurn(adventure, log, { type: 'continue', text: '' }, { provider, tokenizer: createApproxTokenizer() })) {
      // drain
    }
  }
  return requests;
}

describe('dynamic samplers', () => {
  it('off: every turn uses the adventure samplers', async () => {
    const requests = await playTurns(false, 3);
    expect(requests.map((r) => r.temperature)).toEqual([0.42, 0.42, 0.42]);
  });

  it('on: each turn takes the next preset, so consecutive turns differ', async () => {
    const requests = await playTurns(true, 3);
    const temps = requests.map((r) => r.temperature);
    expect(temps).not.toContain(0.42);
    for (const r of requests) expect(MODEL_PRESETS.some((p) => p.settings.topK === r.topK && p.settings.topP === r.topP)).toBe(true);
    expect(new Set(requests.map((r) => `${r.temperature}/${r.topK}/${r.topP}`)).size).toBe(3);
  });

  it('on: the prompt is the same as off, so the KV cache is unaffected', async () => {
    const [on] = await playTurns(true, 1);
    const [off] = await playTurns(false, 1);
    expect(on?.prompt).toBe(off?.prompt);
  });
});
