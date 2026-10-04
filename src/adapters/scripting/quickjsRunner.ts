import type { HookInput, HookResult, ScriptRunner } from '@core/ports';
import { ScriptReply, type ScriptRequest } from './protocol';
import type { Scripts } from './sandbox';

/** The in-VM interrupt should fire first; this is the backstop for a VM that never yields. */
const HARD_TIMEOUT_MS = 3000; // [provisional]

/** The slice of `Worker` the runner uses; tests pass a fake. */
export interface ScriptWorker {
  postMessage(msg: ScriptRequest, transfer: Transferable[]): void;
  addEventListener(type: 'message' | 'error', fn: (e: Event) => void): void;
  terminate(): void;
}

interface Waiter {
  input: HookInput;
  resolve: (r: HookResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const failed = (input: HookInput, error: string, elapsedMs = 0): HookResult => ({
  text: input.text,
  state: input.state,
  storyCards: input.storyCards,
  sections: input.sections,
  logs: [],
  error,
  elapsedMs,
});

/** Runs scenario scripts in QuickJS inside a Web Worker. `spawn` builds `./scripts.worker.ts`; tests pass a fake. */
export class QuickJsScriptRunner implements ScriptRunner {
  private readonly spawn: () => ScriptWorker;
  private worker: ScriptWorker;
  private scripts: Scripts | undefined;
  private readonly pending = new Map<number, Waiter>();
  private loading: { resolve: (r: { ok: boolean; error?: string | undefined }) => void } | undefined;
  private nextId = 1;

  constructor(spawn: () => ScriptWorker) {
    this.spawn = spawn;
    this.worker = this.listen(spawn());
  }

  load(scripts: Scripts): Promise<{ ok: boolean; error?: string | undefined }> {
    this.scripts = scripts;
    return new Promise((resolve) => {
      this.loading = { resolve };
      this.worker.postMessage({ type: 'load', scripts }, []);
    });
  }

  run(input: HookInput): Promise<HookResult> {
    const { sections: _sections, ...payload } = input;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.onTimeout(id), HARD_TIMEOUT_MS);
      this.pending.set(id, { input, resolve, reject, timer });
      this.worker.postMessage({ type: 'run', id, input: payload }, []);
    });
  }

  dispose(): void {
    this.failAll(new Error('script runner disposed'));
    this.worker.terminate();
  }

  private listen(worker: ScriptWorker): ScriptWorker {
    worker.addEventListener('message', (e) => this.onMessage('data' in e ? e.data : undefined));
    worker.addEventListener('error', () => this.failAll(new Error('script worker failed')));
    return worker;
  }

  private onMessage(data: unknown): void {
    const parsed = ScriptReply.safeParse(data);
    // A malformed reply cannot be matched to a request, so nothing pending can be trusted.
    if (!parsed.success) return this.failAll(new Error(`malformed script reply: ${parsed.error.message}`));
    const reply = parsed.data;
    if (reply.type === 'loaded') {
      const loading = this.loading;
      this.loading = undefined;
      return loading?.resolve({ ok: reply.ok, error: reply.error });
    }
    const waiter = this.take(reply.id);
    // An error the worker could not tie to a request (a rejected request, say): nothing pending can still be answered.
    if (!waiter) return reply.type === 'error' ? this.failAll(new Error(reply.message)) : undefined;
    waiter.resolve(reply.type === 'result' ? { ...reply.result, sections: waiter.input.sections } : failed(waiter.input, reply.message));
  }

  /** The VM ignored its interrupt: terminate, start fresh, and reload the scripts for the next run. */
  private onTimeout(id: number): void {
    const waiter = this.take(id);
    if (!waiter) return;
    this.worker.terminate();
    this.failAll(new Error('script worker restarted'));
    this.worker = this.listen(this.spawn());
    if (this.scripts) this.worker.postMessage({ type: 'load', scripts: this.scripts }, []);
    waiter.resolve(failed(waiter.input, 'script timed out', HARD_TIMEOUT_MS));
  }

  private take(id: number | undefined): Waiter | undefined {
    if (id === undefined) return undefined;
    const waiter = this.pending.get(id);
    if (!waiter) return undefined;
    clearTimeout(waiter.timer);
    this.pending.delete(id);
    return waiter;
  }

  private failAll(err: Error): void {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
    this.pending.clear();
    this.loading?.resolve({ ok: false, error: err.message });
    this.loading = undefined;
  }
}

/** The real runner. `new URL(...)` is what makes Vite emit the worker and its wasm as separate chunks. */
export function createQuickJsRunner(): ScriptRunner {
  return new QuickJsScriptRunner(() => new Worker(new URL('./scripts.worker.ts', import.meta.url), { type: 'module' }));
}
