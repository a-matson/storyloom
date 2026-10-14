import { describe, expect, it } from 'vitest';
import { helperModelFor } from '@app/session/helperModel';
import type { SessionServices } from '@app/session/types';
import { createBlankAdventure, UTILITY_READS, type AppSettings, type ReadKind } from '@core/model';
import type { Provider } from '@core/ports';
import { AppSettings as AppSettingsSchema } from '@core/schema';

const fake = (id: string, ok = true) => ({ id, health: () => Promise.resolve({ ok, modelId: id }) }) as unknown as Provider;

function host(readsOn: AppSettings['readsOn'], utilityUp = true) {
  const app = AppSettingsSchema.parse({
    providers: [{ id: 'utility', role: 'utility', kind: 'llama-server', name: 'u', baseUrl: 'http://u', template: 'llama3' }],
    defaultProviderId: 'story',
    readsOn,
  });
  const providers = { story: fake('story'), utility: fake('utility', utilityUp) };
  const svc = { providerFor: (_: AppSettings, id: string) => (id === 'utility' ? providers.utility : providers.story) } as unknown as SessionServices;
  return { app, adv: createBlankAdventure('T', 'Go.'), svc };
}

const READS: ReadKind[] = ['scene', 'state', 'batch', 'memory', 'summary', 'check', 'card'];
const on = async (h: ReturnType<typeof host>, read: ReadKind, down: string[] = []) => (await helperModelFor(read, h, (u) => down.push(u))).provider.id;

describe('helper model per read', () => {
  it('story: never the utility model', async () => {
    for (const read of READS) expect(await on(host('story'), read)).toBe('story');
  });

  it('utility: every read on it, with its own template, while it is up', async () => {
    const h = host('utility');
    for (const read of READS) expect(await on(h, read)).toBe('utility');
    expect((await helperModelFor('state', h, () => {})).template).toBe('llama3');
  });

  it('falls back to the story model and reports the server when the utility model is down', async () => {
    const down: string[] = [];
    expect(await on(host('utility', false), 'scene', down)).toBe('story');
    expect(down).toEqual(['http://u']);
  });

  it('bench: the utility model only for the reads it won', async () => {
    for (const read of READS) expect(await on(host('bench'), read)).toBe(UTILITY_READS.has(read) ? 'utility' : 'story');
  });

  it('no utility model configured: the story model whatever the setting', async () => {
    const h = { ...host('utility'), app: AppSettingsSchema.parse({ providers: [], defaultProviderId: 'story', readsOn: 'utility' }) };
    expect(await on(h, 'memory')).toBe('story');
  });
});
