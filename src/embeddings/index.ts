/**
 * Embedding client for the Memory Bank.
 *
 * Priority: backend `/embedding` when the story server was started with
 * `--embedding` (rare, and it competes for VRAM) → in-browser model via
 * Transformers.js in a Web Worker (milestone 4) → HashEmbedder.
 *
 * HashEmbedder is a deterministic bag-of-words hashing vector. It is not
 * semantic, but it is good enough for keyword-ish recall, needs no model
 * download, runs everywhere, and makes the retrieval path testable.
 */
export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

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
    const v = new Array<number>(this.dimensions).fill(0);
    const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
    let prev = '';
    for (const w of words) {
      if (STOP.has(w)) {
        prev = w;
        continue;
      }
      const stem = w.length > 5 ? w.slice(0, 5) : w;
      v[fnv1a(stem) % this.dimensions]! += 1;
      // Bigram feature for a bit of phrase sensitivity.
      if (prev && !STOP.has(prev)) v[fnv1a(prev + ' ' + stem) % this.dimensions]! += 0.5;
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
  readonly dimensions: number;
  private readonly fn: (texts: string[]) => Promise<number[][]>;
  constructor(fn: (texts: string[]) => Promise<number[][]>, dimensions = 0, id = 'provider') {
    this.fn = fn;
    this.dimensions = dimensions;
    this.id = id;
  }
  embed(texts: string[]): Promise<number[][]> {
    return this.fn(texts);
  }
}
