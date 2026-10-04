import { jsonrepair } from 'jsonrepair';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATOR_SETTINGS, generateStoryCard, parseCardJson, recentStory } from '@core/cards/cardGenerator';
import { normaliseTriggers } from '@core/cards/storyCards';
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
  it('lower-cases, trims, dedupes, keeps the name and its first word, caps at 4', () => {
    const t = normaliseTriggers([' Rider ', 'rider', 'RIDER', 'merav', 'abc', 'x1234', 'x2345', 'x3456'], 'Merav the Blind');
    expect(t).toEqual(['Merav the Blind', 'Merav', 'rider', 'x1234']);
  });
  it('drops generic words and anything shorter than 4 characters', () => {
    expect(normaliseTriggers(['spell', 'preparation', 'tools', 'life', 'inn', 'lantern'], 'Tamsin')).toEqual(['Tamsin', 'lantern']);
  });
  // V-2b: a fantasy adventure got a modern card with eight vague triggers.
  it('keeps only triggers found in the story or the entry, story hits first', () => {
    const story = 'You step off the ferry. Owen, the old tinker, waves from the dock while frost creeps over the river.';
    const entry =
      "Owen Webb worked as an IT technician in the city's high-tech district, developing and maintaining computer systems for various clients. " +
      'His expertise in cybersecurity and network administration made him a valuable asset, but his introverted nature often isolated him from his colleagues.';
    const raw = [
      'Owen Webb',
      'Owen',
      'cybersecurity',
      'network administration',
      'urban development',
      'isolated life',
      'emergency protocols',
      'threat assessment',
      'tinker',
    ];
    expect(normaliseTriggers(raw, 'Owen Webb', { story, entry })).toEqual(['Owen Webb', 'Owen', 'tinker', 'cybersecurity']);
  });
  // V-2: a Location card whose triggers would fire on any magic scene.
  it('drops V-2 location triggers that are generic or absent', () => {
    const story = 'The mayor of Hollowmere calls the town to the moot hall. Braziers burn along the walls.';
    const entry = 'The moot hall of Hollowmere is a long timber hall where the town council meets. Braziers line its walls.';
    const raw = ['spell', 'binding', 'preparation', 'iron tools', 'braziers', 'frost patterns'];
    expect(normaliseTriggers(raw, 'Moot Hall', { story, entry })).toEqual(['Moot Hall', 'Moot', 'braziers']);
  });
});

describe('recentStory', () => {
  it('returns the story tail, starting on a word, within the character cap', () => {
    const actions = ['The ferry creaks.', '> You pay the ferrywoman.', 'Tamsin pockets the coin and pushes off.'].map((text, i) => ({
      id: `a${i}`,
      type: i === 1 ? ('do' as const) : ('continue' as const),
      versions: [text],
      active: 0,
      createdAt: 0,
    }));
    expect(recentStory(actions)).toBe('The ferry creaks.\n\n> You pay the ferrywoman.\n\nTamsin pockets the coin and pushes off.');
    expect(recentStory(actions, 30)).toBe('the coin and pushes off.');
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
    expect(g.triggers).toEqual(['Merav', 'caravan']);
  });
  it('shows the model the story, the essentials and an example of the type', async () => {
    const p = fakeProvider('{"name":"Merav","entry":"Merav leads the caravan.","triggers":["merav","rider","desert"]}', true);
    const g = await generateStoryCard(
      { type: 'Character', settings: DEFAULT_GENERATOR_SETTINGS, plotEssentials: 'A desert trade road.', recentStory: 'Merav the rider halts the camels.' },
      { provider: p, template: 'chatml' },
    );
    expect(p.last?.prompt).toContain('Story essentials:\nA desert trade road.');
    expect(p.last?.prompt).toContain('Recent story:\n---\nMerav the rider halts the camels.\n---');
    expect(p.last?.prompt).toContain('that appears in the text above');
    expect(p.last?.prompt).toContain('Example Character card');
    // "desert" is only in the essentials, which are not a trigger source.
    expect(g.triggers).toEqual(['Merav', 'rider']);
  });
  it('falls back to a "{" prefill and brace extraction without schema support', async () => {
    const p = fakeProvider('"name":"Dov","entry":"Dov carries the map.","triggers":["dov","map"]} trailing prose', false);
    const g = await generateStoryCard({ type: 'Character', name: 'Dov', settings: DEFAULT_GENERATOR_SETTINGS }, { provider: p, template: 'chatml' });
    expect(p.last?.jsonSchema).toBeUndefined();
    expect(p.last?.prompt.endsWith('<|im_start|>assistant\n{')).toBe(true);
    expect(g.entry).toBe('Dov carries the map.');
    expect(g.name).toBe('Dov');
  });
  // V-3 finding 15: with a Tamsin card already saved, the generator made a second one 4/4 runs.
  it('names the existing cards and retries once when the model repeats one', async () => {
    const replies = [
      '{"name":"Tamsin","entry":"Tamsin rows the ferry.","triggers":["tamsin","ferry"]}',
      '{"name":"Owen","entry":"Owen mends kettles on the dock.","triggers":["owen","tinker"]}',
    ];
    const p = fakeProvider('', true);
    p.complete = async function* (req) {
      p.last = req;
      yield { text: replies.shift() ?? '', done: false };
      yield { text: '', done: true, stats: { stopReason: 'stop' } };
    };
    const g = await generateStoryCard(
      { type: 'Character', settings: DEFAULT_GENERATOR_SETTINGS, recentStory: 'Tamsin pushes off. Owen waves from the dock.', existingNames: ['Tamsin'] },
      { provider: p, template: 'chatml' },
    );
    expect(p.last?.prompt).toContain('These already have a card, so pick a different subject: Tamsin.');
    expect(g.name).toBe('Owen');
    expect(replies).toHaveLength(0);
  });
  it('keeps the name when the player asked for an entry, duplicate or not', async () => {
    const p = fakeProvider('{"name":"Tamsin","entry":"Tamsin rows the ferry.","triggers":["tamsin","ferry"]}', true);
    const g = await generateStoryCard(
      { type: 'Character', name: 'Tamsin', settings: DEFAULT_GENERATOR_SETTINGS, existingNames: ['Tamsin'] },
      { provider: p, template: 'chatml' },
    );
    expect(p.last?.prompt).not.toContain('already have a card');
    expect(g.name).toBe('Tamsin');
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
