import type { Embedder } from '@core/ports';

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'is',
  'are',
  'was',
  'were',
  'it',
  'you',
  'your',
  'he',
  'she',
  'they',
  'i',
  'we',
  'that',
  'this',
  'with',
  'for',
  'as',
  'but',
  'be',
  'by',
  'from',
  'his',
  'her',
  'their',
  'its',
]);

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class HashEmbedder implements Embedder {
  readonly id = 'hash-bow';
  readonly dimensions: number;
  constructor(dimensions = 512) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.one(t));
  }

  one(text: string): number[] {
    const v = Array.from({ length: this.dimensions }, () => 0);
    const bump = (i: number, by: number) => (v[i] = (v[i] ?? 0) + by);
    const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
    let prev = '';
    for (const w of words) {
      if (STOP.has(w)) {
        prev = w;
        continue;
      }
      const stem = w.length > 5 ? w.slice(0, 5) : w;
      bump(fnv1a(stem) % this.dimensions, 1);
      // Bigram feature for a bit of phrase sensitivity.
      if (prev && !STOP.has(prev)) bump(fnv1a(prev + ' ' + stem) % this.dimensions, 0.5);
      prev = w;
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return v.map((x) => x / norm);
  }
}

/** Adapter over a provider's embed() when the backend serves embeddings. */
export class ProviderEmbedder implements Embedder {
  readonly id: string;
  /** Learnt from the first result when not given. */
  dimensions: number;
  private readonly fn: (texts: string[]) => Promise<number[][]>;
  constructor(fn: (texts: string[]) => Promise<number[][]>, dimensions = 0, id = 'provider') {
    this.fn = fn;
    this.dimensions = dimensions;
    this.id = id;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.fn(texts);
    this.dimensions = vectors[0]?.length ?? this.dimensions;
    return vectors;
  }
}

/** Lazy, so the worker client stays out of the start-up bundle. Rejects when no model is present. */
export const loadInBrowserEmbedder = (): Promise<Embedder> => import('./workerEmbedder').then((m) => m.loadWorkerEmbedder());
