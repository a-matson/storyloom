import { describe, expect, it } from 'vitest';
import { styleOf } from '@app/session/portraitPrompt';
import { DEFAULT_GENERATOR_SETTINGS, generateStoryCard } from '@core/cards/cardGenerator';
import { writeOpening } from '@core/cards/opening';
import { autoImagePrompt } from '@core/image/autoPrompt';
import { imageRequest } from '@core/image';
import { checkOutput } from '@core/memory/contradiction';
import { createBlankAdventure } from '@core/model/scenario';
import { DEFAULT_ADVENTURE_SETTINGS } from '@core/model';
import type { Action } from '@core/model';
import type { CompletionChunk, CompletionRequest, Provider, ProviderCapabilities } from '@core/ports/provider';
import { CONTENT_RECORD, CONTENT_UNRESTRICTED, contentClause } from '@core/text/content';
import { buildWarmupPrompt, prepareContext } from '@core/turn';
import type { Tokenizer } from '@core/text/tokenizer';

const tok: Tokenizer = { count: (t) => (t ? Math.ceil(t.length / 4) : 0) };
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
  grammar: false,
  jsonSchema: false,
  images: false,
};

function fake(reply: string): Provider & { last?: CompletionRequest } {
  const p: Provider & { last?: CompletionRequest } = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.resolve(caps),
    async *complete(req: CompletionRequest): AsyncIterable<CompletionChunk> {
      p.last = req;
      yield { text: reply, done: false };
      yield { text: '', done: true, stats: { stopReason: 'stop' } };
    },
  };
  return p;
}

const settings = DEFAULT_ADVENTURE_SETTINGS;
const actions = [{ id: 'a1', type: 'start', versions: ['The ferry creaks.'], activeVersion: 0, createdAt: 0 }] as unknown as Action[];

describe('contentClause', () => {
  it('is unrestricted by default, shorter for helper jobs', () => {
    expect(contentClause(settings, 'story')).toBe(CONTENT_UNRESTRICTED);
    expect(contentClause(settings, 'record')).toBe(CONTENT_RECORD);
  });

  it('sends the custom text instead, and nothing when it is blank', () => {
    expect(contentClause({ content: 'custom', contentText: ' Keep it gentle. ' }, 'story')).toBe('Keep it gentle.');
    expect(contentClause({ content: 'custom', contentText: ' ' }, 'record')).toBe('');
    expect(contentClause({ content: 'custom' }, 'story')).toBe('');
  });
});

describe('story prompt', () => {
  it('carries the clause after the AI Instructions, and alone when there are none', async () => {
    const adv = createBlankAdventure('T', 'Opening.');
    adv.plot.aiInstructions = 'Write in second person.';
    const deps = { provider: fake(''), tokenizer: tok };
    const p = await prepareContext(adv, adv.actions, deps);
    if ('stopped' in p) throw new Error('stopped');
    expect(p.prompt).toContain(`Write in second person.\n\n${CONTENT_UNRESTRICTED}`);
    adv.plot.aiInstructions = '';
    const bare = await prepareContext(adv, adv.actions, deps);
    if ('stopped' in bare) throw new Error('stopped');
    expect(bare.prompt).toContain(CONTENT_UNRESTRICTED);
  });

  it('replaces it with the custom text, and sends none when that is blank', async () => {
    const adv = createBlankAdventure('T', 'Opening.');
    adv.settings.content = 'custom';
    adv.settings.contentText = 'House rules.';
    const deps = { provider: fake(''), tokenizer: tok };
    const p = await prepareContext(adv, adv.actions, deps);
    if ('stopped' in p) throw new Error('stopped');
    expect(p.prompt).toContain('House rules.');
    expect(p.prompt).not.toContain('adult reader');
    adv.settings.contentText = '';
    const blank = await prepareContext(adv, adv.actions, deps);
    if ('stopped' in blank) throw new Error('stopped');
    expect(blank.prompt).not.toContain('adult');
  });

  it('is in the cacheable prefix', async () => {
    const adv = createBlankAdventure('T', 'Opening.');
    const warm = await buildWarmupPrompt(adv, adv.actions, { provider: fake(''), tokenizer: tok });
    expect(warm).toContain(CONTENT_UNRESTRICTED);
  });
});

describe('helper prompts', () => {
  const content = CONTENT_RECORD;

  it('opening and surprise', async () => {
    const provider = fake('You wake.');
    await writeOpening({ brief: 'b', picks: [] }, { provider, template: 'chatml', content });
    expect(provider.last?.prompt).toContain(CONTENT_RECORD);
  });

  it('cards', async () => {
    const provider = fake('"name":"Mara","entry":"Mara is a ferrywoman on the grey river.","triggers":["mara"]}');
    await generateStoryCard({ type: 'Character', settings: DEFAULT_GENERATOR_SETTINGS }, { provider, template: 'chatml', content });
    expect(provider.last?.prompt).toContain(CONTENT_RECORD);
  });

  it('contradiction check', async () => {
    const provider = fake('{"contradicts": false, "fact": ""}');
    await checkOutput('She smiles.', ['Mara is dead.'], { provider, template: 'chatml', content });
    expect(provider.last?.prompt).toContain(CONTENT_RECORD);
  });

  it('image prompt names mature content plainly and carries the clause', async () => {
    const provider = fake('woman, blood');
    await autoImagePrompt({ actions }, { provider, template: 'chatml', content });
    expect(provider.last?.prompt).toContain('no euphemisms');
    expect(provider.last?.prompt).toContain(CONTENT_RECORD);
  });
});

describe('prompt suffix', () => {
  it('is appended to the image request, and ignored when blank', () => {
    expect(imageRequest({ ...settings.image, promptSuffix: ' gore, nsfw ' }, 'a ferry').prompt).toBe('a ferry, gore, nsfw');
    expect(imageRequest({ ...settings.image, promptSuffix: ' ' }, 'a ferry').prompt).toBe('a ferry');
  });

  it('prefix first, suffix last', () => {
    expect(imageRequest({ ...settings.image, promptPrefix: 'score_9 ', promptSuffix: 'nsfw' }, 'a ferry').prompt).toBe('score_9, a ferry, nsfw');
  });

  it('a recipe prefix is the style unless the player set one', () => {
    expect(styleOf({ promptPrefix: 'score_9' }, ['Fantasy'])).toBe('');
    expect(styleOf({ promptPrefix: 'score_9', portraitStyle: 'ink' }, [])).toBe('ink');
    expect(styleOf({}, ['Fantasy'])).toBe('oil painting, muted colours');
  });
});
