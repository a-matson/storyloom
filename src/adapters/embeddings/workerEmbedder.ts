import type { Embedder } from '@core/ports';
import { EMBED_MODEL, EmbedReply, type EmbedRequest } from './protocol';

/** The slice of `Worker` the embedder uses; tests pass a fake. */
export interface EmbedWorker {
  postMessage(msg: EmbedRequest, transfer: Transferable[]): void;
  addEventListener(type: 'message' | 'error', fn: (e: Event) => void): void;
  terminate(): void;
}

interface Waiter {
  resolve: (v: number[][]) => void;
  reject: (e: Error) => void;
}

/** In-browser embeddings via Transformers.js in a Web Worker. Call `init()` before use. */
export class WorkerEmbedder implements Embedder {
  readonly id = `tjs-${EMBED_MODEL}`;
  /** Known after the first result. */
  dimensions = 0;
  private readonly worker: EmbedWorker;
  private readonly pending = new Map<number, Waiter>();
  private nextId = 1;

  constructor(worker: EmbedWorker) {
    this.worker = worker;
    worker.addEventListener('message', (e) => this.onMessage('data' in e ? e.data : undefined));
    worker.addEventListener('error', (e) => this.failAll(new Error(`embedding worker failed: ${'message' in e ? String(e.message) : e.type}`)));
  }

  /** Resolves once the model is loaded; rejects when it is missing or fails to load. */
  init(): Promise<void> {
    return this.request({ type: 'init' }, 0).then(() => undefined);
  }

  embed(texts: string[]): Promise<number[][]> {
    const id = this.nextId++;
    return this.request({ type: 'embed', id, texts }, id);
  }

  dispose(): void {
    this.failAll(new Error('embedder disposed'));
    this.worker.terminate();
  }

  private request(msg: EmbedRequest, id: number): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(msg, []);
    });
  }

  private onMessage(data: unknown): void {
    const reply = EmbedReply.safeParse(data);
    // A malformed reply cannot be matched to a request, so nothing pending can be trusted.
    if (!reply.success) return this.failAll(new Error(`malformed embedding reply: ${reply.error.message}`));
    const r = reply.data;
    const id = r.type === 'ready' ? 0 : (r.id ?? 0);
    const waiter = this.pending.get(id);
    this.pending.delete(id);
    if (r.type === 'error') return waiter?.reject(new Error(r.message));
    if (r.type === 'result') this.dimensions = r.vectors[0]?.length ?? this.dimensions;
    waiter?.resolve(r.type === 'result' ? r.vectors : []);
  }

  private failAll(err: Error): void {
    for (const w of this.pending.values()) w.reject(err);
    this.pending.clear();
  }
}

/** Spawns the worker and loads the model; rejects (and cleans up) when no model is present. */
export async function loadWorkerEmbedder(): Promise<WorkerEmbedder> {
  const embedder = new WorkerEmbedder(new Worker(new URL('./embeddings.worker.ts', import.meta.url), { type: 'module' }));
  try {
    await embedder.init();
    return embedder;
  } catch (e) {
    embedder.dispose();
    throw e;
  }
}
