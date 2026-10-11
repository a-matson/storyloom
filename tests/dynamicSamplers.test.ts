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
      yield { text: '', done: true, stats: { stopReason: 'length' } };
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

  it('on: jitters only the loaded preset, so consecutive turns differ', async () => {
    const requests = await playTurns(true, 4);
    const [preset] = MODEL_PRESETS;
    if (preset?.settings.topK === undefined) throw new Error('first preset has no topK');
    for (const r of requests) {
      expect(Math.abs(r.temperature - preset.settings.temperature)).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(r.topP).toBe(preset.settings.topP);
      expect(r.minP).toBe(0.05);
      expect(r.topK).toBeGreaterThanOrEqual(Math.round(preset.settings.topK * 0.8));
      expect(r.topK).toBeLessThanOrEqual(Math.round(preset.settings.topK * 1.2));
    }
    expect(new Set(requests.map((r) => `${r.temperature}/${r.topK}`)).size).toBe(4);
    expect(new Set(requests.map((r) => r.seed)).size).toBe(4);
  });

  it('on: the prompt is the same as off, so the KV cache is unaffected', async () => {
    const [on] = await playTurns(true, 1);
    const [off] = await playTurns(false, 1);
    expect(on?.prompt).toBe(off?.prompt);
  });
});
