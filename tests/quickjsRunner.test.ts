import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickJsScriptRunner, type ScriptWorker } from '@adapters/scripting';
import type { ScriptRequest } from '@adapters/scripting/protocol';
import type { HookInput } from '@core/ports';

class FakeWorker implements ScriptWorker {
  sent: ScriptRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, (e: Event) => void>();
  postMessage(msg: ScriptRequest, _transfer: Transferable[]): void {
    this.sent.push(msg);
  }
  addEventListener(type: 'message' | 'error', fn: (e: Event) => void): void {
    this.listeners.set(type, fn);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.listeners.get('message')?.(new MessageEvent('message', { data }));
  }
  /** Id of the nth `run` it was asked to do. */
  runId(n = 0): number {
    const runs = this.sent.filter((m) => m.type === 'run');
    return runs[n]?.type === 'run' ? runs[n].id : -1;
  }
}

const SCRIPTS = { library: '', input: '', context: '', output: 'modifier(text)' };

const sections = [{ kind: 'history' as const, text: 'You open it', tokens: 3, cacheable: true }];
const hookInput: HookInput = {
  hook: 'onOutput',
  text: 'the door creaks',
  history: [],
  storyCards: [],
  state: {},
  info: { characterNames: [], actionCount: 1 },
  sections,
};

const okReply = (id: number) => ({ type: 'result', id, result: { text: 'done', state: {}, storyCards: [], logs: ['hi'], elapsedMs: 2 } });

function harness() {
  const workers: FakeWorker[] = [];
  const spawn = () => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  };
  return { workers, runner: new QuickJsScriptRunner(spawn) };
}

afterEach(() => vi.useRealTimers());

describe('QuickJsScriptRunner', () => {
  it('reports a load failure from the worker', async () => {
    const { workers, runner } = harness();
    const loaded = runner.load(SCRIPTS);
    workers[0]?.reply({ type: 'loaded', ok: false, error: 'output: unexpected token' });
    expect(await loaded).toEqual({ ok: false, error: 'output: unexpected token' });
  });

  it('keeps sections out of the worker and puts them back on the result', async () => {
    const { workers, runner } = harness();
    const p = runner.run(hookInput);
    expect(workers[0]?.sent[0]).not.toHaveProperty('input.sections');
    workers[0]?.reply(okReply(workers[0].runId()));
    expect(await p).toMatchObject({ text: 'done', logs: ['hi'], sections });
  });

  it('turns a worker error into a result error, leaving the text alone', async () => {
    const { workers, runner } = harness();
    const p = runner.run(hookInput);
    workers[0]?.reply({ type: 'error', id: workers[0].runId(), message: 'wasm gone' });
    expect(await p).toMatchObject({ text: 'the door creaks', error: 'wasm gone' });
  });

  it('terminates and respawns on the hard timeout, then serves the next run', async () => {
    vi.useFakeTimers();
    const { workers, runner } = harness();
    const loaded = runner.load(SCRIPTS);
    workers[0]?.reply({ type: 'loaded', ok: true });
    await loaded;

    const slow = runner.run(hookInput);
    vi.advanceTimersByTime(3000);
    expect(await slow).toMatchObject({ error: 'script timed out', text: 'the door creaks' });
    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1]?.sent[0]).toEqual({ type: 'load', scripts: SCRIPTS });

    const next = runner.run(hookInput);
    workers[1]?.reply(okReply(workers[1].runId()));
    expect(await next).toMatchObject({ text: 'done' });
  });

  it('rejects everything pending on a malformed reply', async () => {
    const { workers, runner } = harness();
    const p = runner.run(hookInput);
    workers[0]?.reply({ type: 'result', id: workers[0].runId(), result: { text: 'done' } });
    await expect(p).rejects.toThrow('malformed script reply');
  });

  it('dispose rejects pending runs and terminates the worker', async () => {
    const { workers, runner } = harness();
    const p = runner.run(hookInput);
    runner.dispose();
    await expect(p).rejects.toThrow('disposed');
    expect(workers[0]?.terminated).toBe(true);
  });
});
