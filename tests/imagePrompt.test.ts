import { describe, expect, it } from 'vitest';
import { autoImagePrompt, imagePromptPrompt, tagLine, IMAGE_PROMPT_CHARS } from '@core/image/autoPrompt';
import type { Action } from '@core/model';
import type { CompletionChunk, CompletionRequest, Provider } from '@core/ports';

const actions = [
  { id: 'a1', type: 'start', versions: ['The ferry creaks against the jetty.'], activeVersion: 0, createdAt: 0 },
  { id: 'a2', type: 'do', versions: ['pay the ferrywoman'], activeVersion: 0, createdAt: 1 },
  { id: 'a3', type: 'continue', versions: ['Tamsin pockets the coin and poles into the mist.'], activeVersion: 0, createdAt: 2 },
] as unknown as Action[];

function fakeProvider(reply: string): Provider & { last?: CompletionRequest } {
  const p: Provider & { last?: CompletionRequest } = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.resolve({} as never),
    async *complete(req: CompletionRequest): AsyncIterable<CompletionChunk> {
      p.last = req;
      yield { text: reply, done: false };
      yield { text: '', done: true, stats: { stopReason: 'stop' } };
    },
  };
  return p;
}

const deps = (reply: string) => ({ provider: fakeProvider(reply), template: 'chatml' as const });

describe('imagePromptPrompt', () => {
  it('includes essentials and the recent story only when non-empty', () => {
    const full = imagePromptPrompt({ recentStory: 'Tamsin poles into the mist.', plotEssentials: 'A river of ferry towns.' });
    expect(full).toContain('Story essentials:\nA river of ferry towns.');
    expect(full).toContain('Recent story:\n---\nTamsin poles into the mist.');
    const bare = imagePromptPrompt({ recentStory: '' });
    expect(bare).not.toContain('Story essentials');
    expect(bare).not.toContain('Recent story');
    expect(bare).toContain('one line of comma-separated tags');
  });
});

describe('tagLine', () => {
  it('keeps one line, drops quotes and a label', () => {
    expect(tagLine('Prompt: "misty river, lone ferry"\nAnother line')).toBe('misty river, lone ferry');
  });

  it('cuts a long reply at a comma, not mid-word', () => {
    const long = Array.from({ length: 60 }, (_, i) => `tag number ${i}`).join(', ');
    const cut = tagLine(long);
    expect(cut.length).toBeLessThanOrEqual(IMAGE_PROMPT_CHARS);
    expect(long.startsWith(cut)).toBe(true);
    // Ends on a whole tag, so the last one is never half a word.
    expect(/ \d+$/.test(cut)).toBe(true);
  });

  it('cuts at a word when there is no comma', () => {
    const cut = tagLine('x'.repeat(200) + ' ' + 'y'.repeat(300));
    expect(cut).toBe('x'.repeat(200));
  });
});

describe('autoImagePrompt', () => {
  it('turns the story tail into one tag line on slot 1', async () => {
    const d = deps('ferry deck at dusk, ferrywoman poling into mist\n');
    const prompt = await autoImagePrompt({ actions, plotEssentials: 'A river of ferry towns.' }, d);
    expect(prompt).toBe('ferry deck at dusk, ferrywoman poling into mist');
    expect(d.provider.last?.slotId).toBe(1);
    expect(d.provider.last?.cachePrompt).toBe(false);
    expect(d.provider.last?.prompt).toContain('Tamsin pockets the coin');
    expect(d.provider.last?.prompt).toContain('A river of ferry towns.');
  });

  it('throws when the reply is empty', async () => {
    await expect(autoImagePrompt({ actions }, deps('   \n  '))).rejects.toThrow('no image prompt');
  });
});
