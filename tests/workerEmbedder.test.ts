import { describe, expect, it } from 'vitest';
import { WorkerEmbedder, type EmbedWorker } from '@adapters/embeddings/workerEmbedder';
import type { EmbedRequest } from '@adapters/embeddings/protocol';

class FakeWorker implements EmbedWorker {
  sent: EmbedRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, (e: Event) => void>();
  postMessage(msg: EmbedRequest, _transfer: Transferable[]): void {
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
}

const idOf = (msg: EmbedRequest | undefined) => (msg?.type === 'embed' ? msg.id : -1);

describe('WorkerEmbedder', () => {
  it('initialises, then correlates concurrent requests by id', async () => {
    const w = new FakeWorker();
    const e = new WorkerEmbedder(w);
    const ready = e.init();
    w.reply({ type: 'ready' });
    await ready;

    const a = e.embed(['a']);
    const b = e.embed(['b']);
    const [, first, second] = w.sent;
    w.reply({ type: 'result', id: idOf(second), vectors: [[0, 1, 0]] });
    w.reply({ type: 'result', id: idOf(first), vectors: [[1, 0, 0]] });
    expect(await a).toEqual([[1, 0, 0]]);
    expect(await b).toEqual([[0, 1, 0]]);
    expect(e.dimensions).toBe(3);
  });

  it('rejects init when the model is missing', async () => {
    const w = new FakeWorker();
    const ready = new WorkerEmbedder(w).init();
    w.reply({ type: 'error', message: 'no config.json' });
    await expect(ready).rejects.toThrow('no config.json');
  });

  it('rejects a request the worker reports as failed', async () => {
    const w = new FakeWorker();
    const e = new WorkerEmbedder(w);
    const p = e.embed(['a']);
    w.reply({ type: 'error', id: idOf(w.sent[0]), message: 'oom' });
    await expect(p).rejects.toThrow('oom');
  });

  it('rejects everything pending on a malformed reply', async () => {
    const w = new FakeWorker();
    const e = new WorkerEmbedder(w);
    const p = e.embed(['a']);
    w.reply({ type: 'result', id: idOf(w.sent[0]), vectors: 'nope' });
    await expect(p).rejects.toThrow('malformed embedding reply');
  });

  it('dispose rejects pending requests and terminates the worker', async () => {
    const w = new FakeWorker();
    const e = new WorkerEmbedder(w);
    const p = e.embed(['a']);
    e.dispose();
    await expect(p).rejects.toThrow('disposed');
    expect(w.terminated).toBe(true);
  });
});
