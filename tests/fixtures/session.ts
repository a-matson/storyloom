import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { GameSession, type GameSnapshot } from '@app/session';
import { createBlankAdventure, type Adventure, type AppSettings, type TurnTrace } from '@core/model';
import { NoopScriptRunner, type ImageProvider, type Storage } from '@core/ports';
import { AppSettings as AppSettingsSchema } from '@core/schema';
import { createApproxTokenizer } from '@core/text';

/** A session on the fake llama backend, plus the writes, snapshots, traces and idle callbacks it produced. */
export function setup(
  opts: { failSave?: boolean; prefetch?: boolean; warm?: boolean; adventure?: Adventure; images?: ImageProvider; imageTimeoutMs?: number } = {},
) {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const saved: Adventure[] = [];
  const traces: TurnTrace[] = [];
  const images = new Map<string, Blob>();
  const storage = {
    async putAdventure(a: Adventure) {
      if (opts.failSave) throw new Error('disk full');
      saved.push(structuredClone(a));
    },
    async putTrace(t: TurnTrace) {
      traces.push(t);
    },
    async putImage(adventureId: string, id: string, blob: Blob) {
      images.set(`${adventureId}|${id}`, blob);
    },
    async deleteImage(adventureId: string, id: string) {
      images.delete(`${adventureId}|${id}`);
    },
  } as unknown as Storage;
  const app: AppSettings = AppSettingsSchema.parse({ providers: [], defaultProviderId: 'demo' });
  const adv = opts.adventure ?? createBlankAdventure('Test', 'You stand at the gate.');
  const idle: (() => void)[] = [];
  adv.settings = { ...adv.settings, context: { ...adv.settings.context, cacheWarming: opts.warm ?? false, retryPrefetch: opts.prefetch ?? false } };
  const session = new GameSession(adv, app, {
    providerFor: () => provider,
    imageProviderFor: () => (opts.images ? Promise.resolve(opts.images) : undefined),
    embedderFor: () =>
      opts.adventure
        ? Promise.resolve({ id: 'e', dimensions: 2, embed: (t: string[]) => Promise.resolve(t.map(() => [1, 0])) })
        : Promise.reject(new Error('no embedder')),
    tokenizer: createApproxTokenizer(),
    tokenizerFor: () => createApproxTokenizer(),
    scriptsFor: () => Promise.resolve(new NoopScriptRunner()),
    storage,
    idle: (fn) => idle.push(fn),
    frame: (fn) => setTimeout(fn, 0),
    saveDelayMs: 0,
    rewarmDelayMs: 0,
    imageTimeoutMs: opts.imageTimeoutMs ?? 300_000,
  });
  const snapshots: GameSnapshot[] = [];
  session.subscribe(() => snapshots.push(session.getSnapshot()));
  return { session, saved, snapshots, traces, idle, images };
}

/** Resolves once the session is idle again. */
export const settled = (s: GameSession) =>
  new Promise<void>((resolve) => {
    const check = () => (s.getSnapshot().busy ? setTimeout(check, 1) : resolve());
    setTimeout(check, 1);
  });
