import { describe, expect, it, vi } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { GameSession } from '@app/session';
import type { Embedder, Provider, Storage } from '@core/ports';
import { NoopScriptRunner } from '@core/ports';
import { AppSettings as AppSettingsSchema } from '@core/schema';
import { createApproxTokenizer } from '@core/text';
import { makeAdventure } from './fixtures/adventure';

/** A fake llama-server that records the prompts it was asked to complete. */
function server(id: string, reachable = true) {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const prompts: string[] = [];
  const provider = new LlamaServerProvider(id, `http://${id}.invalid`, async (i, init) => {
    if (!reachable) throw new TypeError('Failed to fetch');
    const req = new Request(i, init);
    if (new URL(req.url).pathname === '/completion') prompts.push(((await req.clone().json()) as { prompt: string }).prompt);
    return handler(req);
  });
  return { provider, prompts };
}

function setup(utilityReachable: boolean) {
  const story = server('story');
  const utility = server('utility', utilityReachable);
  const app = AppSettingsSchema.parse({
    providers: [
      { id: 'story', kind: 'llama-server', name: 'story', baseUrl: 'http://story.invalid' },
      { id: 'utility', kind: 'llama-server', name: 'utility', baseUrl: 'http://utility.invalid', role: 'utility', template: 'llama3' },
    ],
    defaultProviderId: 'story',
  });
  const adventure = makeAdventure({ actions: 30, cards: 0 });
  adventure.settings = {
    ...adventure.settings,
    providerId: 'story',
    template: 'chatml',
    memory: { ...adventure.settings.memory, memoryBank: true, autoSummary: false },
  };
  adventure.settings.context = { ...adventure.settings.context, cacheWarming: false, retryPrefetch: false };
  const embedder: Embedder = { id: 'story-embed', dimensions: 2, embed: (t) => Promise.resolve(t.map(() => [1, 0])) };
  const embeddedFor: Provider[] = [];
  const idle: (() => void)[] = [];
  const session = new GameSession(adventure, app, {
    providerFor: (_, id) => (id === 'utility' ? utility.provider : story.provider),
    embedderFor: (p) => {
      embeddedFor.push(p);
      return Promise.resolve(embedder);
    },
    tokenizer: createApproxTokenizer(),
    tokenizerFor: () => createApproxTokenizer(),
    scripts: new NoopScriptRunner(),
    storage: { putAdventure: () => Promise.resolve(), putTrace: () => Promise.resolve() } as unknown as Storage,
    idle: (fn) => idle.push(fn),
    frame: (fn) => setTimeout(fn, 0),
    saveDelayMs: 0,
  });
  return { session, story, utility, embeddedFor, idle };
}

async function turnThenIdle({ session, story, idle }: ReturnType<typeof setup>): Promise<void> {
  session.submit('continue', '');
  await vi.waitFor(() => expect(session.getSnapshot().busy).toBe(false));
  story.prompts.length = 0;
  idle.splice(0).forEach((fn) => fn());
  await vi.waitFor(() => expect(session.getSnapshot().adventure.memories.length).toBeGreaterThan(0));
}

describe('utility provider', () => {
  it('runs memory jobs on the utility model with its template; embeds on the story side', async () => {
    const s = setup(true);
    await turnThenIdle(s);
    expect(s.story.prompts).toEqual([]);
    expect(s.utility.prompts.length).toBeGreaterThan(0);
    expect(s.utility.prompts[0]).toContain('<|start_header_id|>');
    expect(new Set(s.embeddedFor)).toEqual(new Set([s.story.provider]));
    expect(s.session.getSnapshot().adventure.memories[0]?.embedding).toEqual([1, 0]);
  });

  it('falls back to the story model when the utility server is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = setup(false);
    await turnThenIdle(s);
    expect(s.story.prompts.length).toBeGreaterThan(0);
    expect(s.story.prompts[0]).toContain('<|im_start|>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('utility model at http://utility.invalid is unreachable'));
    warn.mockRestore();
  });
});
