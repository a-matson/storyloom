import { describe, expect, it, vi } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { GameSession, type GameSnapshot } from '@app/session';
import { createBlankAdventure, type Adventure, type AppSettings, type TurnTrace } from '@core/model';
import { NoopScriptRunner, type Storage } from '@core/ports';
import { AppSettings as AppSettingsSchema } from '@core/schema';
import { createApproxTokenizer } from '@core/text';

function setup(opts: { failSave?: boolean; prefetch?: boolean; warm?: boolean } = {}) {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const saved: Adventure[] = [];
  const traces: TurnTrace[] = [];
  const storage = {
    async putAdventure(a: Adventure) {
      if (opts.failSave) throw new Error('disk full');
      saved.push(structuredClone(a));
    },
    async putTrace(t: TurnTrace) {
      traces.push(t);
    },
  } as unknown as Storage;
  const app: AppSettings = AppSettingsSchema.parse({ providers: [], defaultProviderId: 'demo' });
  const adv = createBlankAdventure('Test', 'You stand at the gate.');
  adv.settings = { ...adv.settings, context: { ...adv.settings.context, cacheWarming: opts.warm ?? false, retryPrefetch: opts.prefetch ?? false } };
  const session = new GameSession(adv, app, {
    providerFor: () => provider,
    embedderFor: () => Promise.reject(new Error('no embedder')),
    tokenizer: createApproxTokenizer(),
    scripts: new NoopScriptRunner(),
    storage,
    idle: () => undefined,
    frame: (fn) => setTimeout(fn, 0),
    saveDelayMs: 0,
  });
  const snapshots: GameSnapshot[] = [];
  session.subscribe(() => snapshots.push(session.getSnapshot()));
  return { session, saved, snapshots, traces };
}

/** Resolves once the session is idle again. */
const settled = (s: GameSession) =>
  new Promise<void>((resolve) => {
    const check = () => (s.getSnapshot().busy ? setTimeout(check, 1) : resolve());
    setTimeout(check, 1);
  });

describe('GameSession', () => {
  it('plays a turn: busy, streams, appends, persists', async () => {
    const { session, saved, snapshots, traces } = setup();
    session.submit('do', 'open the gate');
    await settled(session);
    await session.flush();
    const snap = session.getSnapshot();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.outcome).toBe('done');
    expect(traces[0]?.turnId).toBe(snap.actions.at(-1)?.turnId);
    expect(traces[0]?.actionId).toBe(snap.actions.at(-1)?.id);
    expect(snapshots.some((s) => s.busy)).toBe(true);
    expect(snapshots.some((s) => s.streaming.length > 0)).toBe(true);
    expect(snap.actions.map((a) => a.type)).toEqual(['start', 'do', 'continue']);
    expect(snap.context?.prompt).toContain('open the gate');
    expect(saved.at(-1)?.actions).toHaveLength(3);
  });

  it('publishes streamed tokens at most once per frame', async () => {
    const { session, snapshots } = setup();
    session.submit('do', 'open the gate');
    await settled(session);
    const streamed = snapshots.map((s) => s.streaming).filter((t, i, all) => t !== '' && t !== all[i - 1]);
    const words = session.getSnapshot().actions.at(-1)?.versions[0]?.split(' ').length ?? 0;
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed.length).toBeLessThan(words);
  });

  it('publishes new identities only for what changed', async () => {
    const { session } = setup();
    session.submit('do', 'x');
    await settled(session);
    const before = session.getSnapshot();
    session.clearNotice();
    const after = session.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.adventure).not.toBe(before.adventure);
    expect(after.actions).toBe(before.actions);
    expect(after.adventure.storyCards).toBe(before.adventure.storyCards);
  });

  it('retries, undoes and redoes', async () => {
    const { session } = setup();
    session.submit('do', 'wait');
    await settled(session);
    session.retry();
    await settled(session);
    expect(session.getSnapshot().actions.at(-1)?.versions).toHaveLength(2);
    session.undo();
    expect(session.getSnapshot().actions.at(-1)?.versions).toHaveLength(1);
    expect(session.getSnapshot().canRedo).toBe(true);
    session.redo();
    expect(session.getSnapshot().actions.at(-1)?.versions).toHaveLength(2);
  });

  it('shows save failures instead of dropping them', async () => {
    const { session } = setup({ failSave: true });
    session.updateMeta({ title: 'Renamed' });
    await session.flush();
    expect(session.getSnapshot().error).toBe('Could not save: disk full');
  });

  it('cancels a running turn and saves on close', async () => {
    const { session, saved } = setup();
    session.submit('do', 'go');
    await session.close();
    await settled(session);
    expect(saved.length).toBeGreaterThan(0);
    expect(session.getSnapshot().busy).toBe(false);
  });

  it('applies edits and marks memories stale', async () => {
    const { session } = setup();
    session.submit('do', 'look');
    await settled(session);
    const ai = session.getSnapshot().actions.at(-1);
    session.edit(ai?.id ?? '', 'Edited.');
    expect(session.getSnapshot().actions.at(-1)?.versions.at(-1)).toBe('Edited.');
    session.setVersion(ai?.id ?? '', 0);
    expect(session.getSnapshot().actions.at(-1)?.active).toBe(0);
    session.updatePlot({ authorsNote: 'Terse.' });
    session.updateSettings({ textStyle: 'clean' });
    session.updateMeta({ title: 'New title' });
    session.setStoryCards([{ id: 'c', type: 'Location', name: 'Gate', entry: 'A gate.', triggers: ['gate'] }]);
    session.setCardGenerator({ speedCreate: true, includeSummary: false, logToNotes: false, aiInstructions: '', storyInformation: '' });
    const a = session.getSnapshot().adventure;
    expect([a.plot.authorsNote, a.settings.textStyle, a.title, a.storyCards.length, a.cardGenerator?.speedCreate]).toEqual([
      'Terse.',
      'clean',
      'New title',
      1,
      true,
    ]);
    session.erase();
    expect(session.getSnapshot().actions).toHaveLength(2);
    session.eraseTo(session.getSnapshot().actions[1]?.id ?? '');
    expect(session.getSnapshot().actions).toHaveLength(1);
  });

  it('previews the context before any turn', async () => {
    const { session } = setup();
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('You stand at the gate.');
  });

  it('warms the cache and serves Retry from a prefetched alternative', async () => {
    const { session, traces } = setup({ prefetch: true, warm: true });
    session.submit('do', 'wait');
    await settled(session);
    await vi.waitFor(() => expect(session.getSnapshot().prefetchReady).toBe(true));
    await vi.waitFor(() => expect(session.getSnapshot().warm).toBe('warm'));
    // The prefetch's trace is only written once the alternative is used.
    expect(traces).toHaveLength(1);
    session.retry();
    // Instant: no generation, the alternative becomes version 2 at once.
    expect(session.getSnapshot().busy).toBe(false);
    expect(session.getSnapshot().actions.at(-1)?.versions).toHaveLength(2);
    await vi.waitFor(() => expect(traces).toHaveLength(2));
    expect(traces[1]?.kind).toBe('retry');
    expect(traces[1]?.actionId).toBe(session.getSnapshot().actions.at(-1)?.id);
    expect(traces[1]?.turnId).not.toBe(traces[0]?.turnId);
  });
});
