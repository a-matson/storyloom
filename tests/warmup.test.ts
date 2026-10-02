import { describe, expect, it } from 'vitest';
import { renderPrefix, renderTemplate } from '@core/templates';
import { buildWarmupPrompt, prepareContext } from '@core/engine';
import { createBlankAdventure } from '@core/scenario';
import { ActionLog } from '@core/actionLog';
import type { CompletionChunk, Provider, ProviderCapabilities, ProviderHealth } from '@providers/types';
import type { Tokenizer } from '@core/tokenizer';
import type { TemplateId } from '@core/types';

const tok: Tokenizer = { count: (t) => (t ? Math.ceil(t.length / 4) : 0) };

const provider: Provider = {
  id: 'p',
  kind: 'fake',
  baseUrl: '',
  async health(): Promise<ProviderHealth> {
    return { ok: true };
  },
  async capabilities(): Promise<ProviderCapabilities> {
    return {
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
      grammar: true,
      jsonSchema: true,
      images: false,
    };
  },
  async *complete(): AsyncIterable<CompletionChunk> {
    yield { text: '', done: true };
  },
};

describe('renderPrefix', () => {
  it('is a byte-for-byte prefix of the full render for every template', () => {
    const ids: TemplateId[] = ['chatml', 'llama3', 'mistral', 'gemma', 'raw'];
    for (const id of ids) {
      const prefix = renderPrefix(id, 'SYS', 'ESS\n\nRecent Story:\nA.');
      const full = renderTemplate(id, 'SYS', 'ESS\n\nRecent Story:\nA.\n\nWorld Lore:\nB.\n\n> You wave.').prompt;
      expect(full.startsWith(prefix)).toBe(true);
      expect(prefix.length).toBeGreaterThan(10);
    }
  });
});

describe('buildWarmupPrompt', () => {
  it("is a prefix of the next turn's real prompt in cache-stable layout", async () => {
    const adv = createBlankAdventure('T', 'Opening paragraph of the story.');
    adv.plot.plotEssentials = 'Essentials here.';
    adv.plot.authorsNote = 'Terse.';
    adv.storyCards = [{ id: 'c', type: 'Character', name: 'Merav', entry: 'Merav leads.', triggers: ['merav'] }];
    const log = new ActionLog(adv.actions);
    for (let i = 0; i < 6; i++) {
      log.append('do', `> You do thing ${i} with Merav.`);
      log.append('continue', `Reply ${i}. `.repeat(8));
    }
    adv.actions = log.actions;
    const deps = { provider, tokenizer: tok };
    const warm = await buildWarmupPrompt(adv, adv.actions, deps);
    expect(warm).not.toBeNull();
    // The player's next action:
    log.append('do', '> You ask Merav about the map.');
    const prepared = await prepareContext(adv, log.actions, deps);
    if ('stopped' in prepared) throw new Error('unexpected stop');
    expect(prepared.prompt.startsWith(warm!)).toBe(true);
    // The warm-up must not contain the volatile parts.
    expect(warm).not.toContain('World Lore');
    expect(warm).not.toContain("Author's note");
    expect(warm).toContain('Recent Story:');
  });

  it('returns null when the cache-stable layout is off', async () => {
    const adv = createBlankAdventure('T', 'Opening.');
    adv.settings.context.cacheStableLayout = false;
    expect(await buildWarmupPrompt(adv, adv.actions, { provider, tokenizer: tok })).toBeNull();
  });
});
