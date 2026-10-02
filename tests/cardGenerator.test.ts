import { jsonrepair } from 'jsonrepair';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATOR_SETTINGS, generateStoryCard, normaliseTriggers, parseCardJson } from '@core/cards/cardGenerator';
import type { CompletionChunk, CompletionRequest, Provider, ProviderCapabilities, ProviderHealth } from '@core/ports/provider';

function fakeProvider(reply: string, jsonSchema: boolean): Provider & { last?: CompletionRequest } {
  const caps: ProviderCapabilities = {
    streaming: true,
    topK: true,
    penalties: true,
    minP: true,
    repetitionPenalty: true,
    seed: true,
    prefixCache: true,
    parallelSlots: 2,
    tokenize: true,
    embeddings: false,
    grammar: jsonSchema,
    jsonSchema,
    images: false,
  };
  const p: Provider & { last?: CompletionRequest } = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    async health(): Promise<ProviderHealth> {
      return { ok: true };
    },
    async capabilities() {
      return caps;
    },
    async *complete(req: CompletionRequest): AsyncIterable<CompletionChunk> {
      p.last = req;
      yield { text: reply, done: false };
      yield { text: '', done: true, stats: { stopReason: 'stop' } };
    },
  };
  return p;
}

describe('parseCardJson', () => {
  it('parses clean JSON', () => {
    expect(parseCardJson('{"name":"Merav","entry":"Merav leads.","triggers":["merav","rider"]}')).toEqual({
      name: 'Merav',
      entry: 'Merav leads.',
      triggers: ['merav', 'rider'],
    });
  });
  it('tolerates prose and code fences around the JSON', () => {
    const out = parseCardJson('Sure! Here is the card:\n```json\n{"name":"X","entry":"X is here.","triggers":["x"]}\n```\nHope that helps.');
    expect(out?.name).toBe('X');
  });
  it('accepts AID-style keys and comma-separated triggers', () => {
    expect(parseCardJson('{"title":"T","description":"T desc","keys":"a, b"}')).toEqual({ name: 'T', entry: 'T desc', triggers: ['a', ' b'] });
  });
  it('repairs output cut off at the token limit', () => {
    const truncated = 'Here you go: {"name":"Merav","entry":"Merav leads the caravan.","triggers":["merav","rid';
    expect(parseCardJson(truncated)).toBeNull();
    expect(parseCardJson(truncated, jsonrepair)).toEqual({ name: 'Merav', entry: 'Merav leads the caravan.', triggers: ['merav', 'rid'] });
  });
  it('returns null when there is no entry', () => {
    expect(parseCardJson('{"name":"nothing"}')).toBeNull();
    expect(parseCardJson('not json at all')).toBeNull();
  });
});

describe('normaliseTriggers', () => {
  it('lower-cases, trims, dedupes, keeps the name and its first word, caps at 8', () => {
    const t = normaliseTriggers([' Rider ', 'rider', 'RIDER', 'ab', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6'], 'Merav the Blind');
    expect(t[0]).toBe('Merav the Blind');
    expect(t[1]).toBe('Merav');
    expect(t).toContain('rider');
    expect(t).not.toContain('ab');
    expect(t.length).toBeLessThanOrEqual(8);
  });
});

describe('generateStoryCard', () => {
  it('uses json_schema when the backend supports it', async () => {
    const p = fakeProvider('{"name":"Merav","entry":"Merav leads the caravan.","triggers":["merav","caravan"]}', true);
    const g = await generateStoryCard({ type: 'Character', settings: DEFAULT_GENERATOR_SETTINGS }, { provider: p, template: 'chatml' });
    expect(p.last?.jsonSchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' }, entry: { type: 'string' }, triggers: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 } },
      required: ['name', 'entry', 'triggers'],
      additionalProperties: false,
    });
    expect(g.name).toBe('Merav');
    expect(g.triggers).toEqual(['Merav', 'merav', 'caravan']);
  });
  it('falls back to a "{" prefill and brace extraction without schema support', async () => {
    const p = fakeProvider('"name":"Dov","entry":"Dov carries the map.","triggers":["dov","map"]} trailing prose', false);
    const g = await generateStoryCard({ type: 'Character', name: 'Dov', settings: DEFAULT_GENERATOR_SETTINGS }, { provider: p, template: 'chatml' });
    expect(p.last?.jsonSchema).toBeUndefined();
    expect(p.last?.prompt.endsWith('<|im_start|>assistant\n{')).toBe(true);
    expect(g.entry).toBe('Dov carries the map.');
    expect(g.name).toBe('Dov');
  });
  it('throws a clear error on unusable output', async () => {
    const p = fakeProvider('I cannot do that.', true);
    let err = '';
    try {
      await generateStoryCard({ type: 'Location', settings: DEFAULT_GENERATOR_SETTINGS }, { provider: p, template: 'chatml' });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    expect(err).toContain('usable card');
  });
});
