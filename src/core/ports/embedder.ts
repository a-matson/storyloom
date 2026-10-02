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
