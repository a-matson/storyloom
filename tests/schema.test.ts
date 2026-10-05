import { describe, expect, it } from 'vitest';
import { DEFAULT_ADVENTURE_SETTINGS } from '@core/model';
import * as S from '@core/schema';
import { makeAdventure } from './fixtures/adventure';
import { makeTrace } from './fixtures/trace';

describe('schemas', () => {
  it('derive the same defaults the app shipped with', () => {
    expect(DEFAULT_ADVENTURE_SETTINGS).toEqual({
      providerId: 'local',
      template: 'chatml',
      model: { contextLength: 8192, responseLength: 200, temperature: 1.0, topK: 250, topP: 0.95, presencePenalty: 0.25, frequencyPenalty: 0 },
      memory: { autoSummary: true, memoryBank: true, bankSize: 200 },
      context: { cacheStableLayout: true, evictionChunk: 8, rawOutput: false, contextWarning: true, cacheWarming: true, retryPrefetch: false },
      image: { width: 512, height: 512, steps: 24, cfgScale: 5 },
      textStyle: 'print',
    });
  });

  it('round-trip a realistic adventure unchanged', () => {
    const adv = makeAdventure({ actions: 50, cards: 10, memories: 5, embeddingDim: 8 });
    expect(S.Adventure.parse(structuredClone(adv))).toEqual(adv);
  });

  it('fill settings added after a record was saved', () => {
    // `speech.rate` and `image.sampler` were dropped; a record saved with them must still parse.
    const old = {
      providers: [],
      defaultProviderId: 'local',
      defaults: { context: { cacheStableLayout: false }, image: { sampler: 'Euler a' } },
      speech: { rate: 2 },
    };
    const parsed = S.AppSettings.parse(old);
    expect(parsed.defaults.context).toMatchObject({ cacheStableLayout: false, evictionChunk: 8, retryPrefetch: false });
    expect(parsed.theme).toBe('dark');
    expect(parsed.speech).toEqual({ enabled: false });
    expect(parsed.defaults.image).not.toHaveProperty('sampler');
  });

  it('migrate the dropped light theme to sepia', () => {
    const old = { providers: [], defaultProviderId: 'local', theme: 'light' };
    expect(S.AppSettings.parse(old).theme).toBe('sepia');
  });

  it('parse a provider saved before it had a template', () => {
    const old = { providers: [{ id: 'utility', kind: 'llama-server', name: 'u', baseUrl: 'http://x', role: 'utility' }], defaultProviderId: 'local' };
    expect(S.AppSettings.parse(old).providers[0]?.template).toBeUndefined();
    expect(S.ProviderConfig.parse({ ...old.providers[0], template: 'gemma' }).template).toBe('gemma');
  });

  it('strip unknown keys but keep arbitrary script state', () => {
    const adv = { ...makeAdventure({ actions: 1 }), legacyField: 1, scriptState: { custom: { n: 1 } } };
    const parsed = S.Adventure.parse(adv);
    expect('legacyField' in parsed).toBe(false);
    expect(parsed.scriptState['custom']).toEqual({ n: 1 });
  });

  it('parse a trace saved before scripts could touch the cache', () => {
    expect(S.TurnTrace.parse(makeTrace()).scriptCache).toBeUndefined();
    expect(S.TurnTrace.parse(makeTrace({ scriptCache: 'rewritten' })).scriptCache).toBe('rewritten');
  });

  it('reject an image setting of 0', () => {
    for (const key of ['width', 'height', 'steps', 'cfgScale']) {
      expect(S.ImageSettings.safeParse({ [key]: 0 }).success).toBe(false);
    }
  });

  it('reject malformed records with a path', () => {
    const bad = { ...makeAdventure({ actions: 1 }), storyCards: [{ id: 'c', type: 'x', name: 'n', entry: 'e', triggers: 42 }] };
    const r = S.Adventure.safeParse(bad);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['storyCards', 0, 'triggers']);
  });
});
