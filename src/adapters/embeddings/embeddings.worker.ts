/**
 * Embeddings worker — MILESTONE 4 stub.
 *
 * Plan: `pnpm add @huggingface/transformers`, then in this worker:
 *   const extractor = await pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', { dtype: 'q8' });
 *   const out = await extractor(texts, { pooling: 'mean', normalize: true });
 * The model (~30–60 MB) is cached by the browser after first load and runs on
 * CPU (WASM) or WebGPU; it never touches the story model's VRAM.
 *
 * Message protocol (keep it; the main thread already speaks it):
 *   → { id, type: 'embed', texts: string[] }
 *   ← { id, type: 'result', vectors: number[][] } | { id, type: 'error', message }
 */
import { HashEmbedder } from '.';

const fallback = new HashEmbedder();

self.onmessage = async (evt: MessageEvent<{ id: number; type: 'embed'; texts: string[] }>) => {
  const msg = evt.data;
  if (msg.type !== 'embed') return;
  try {
    const vectors = await fallback.embed(msg.texts);
    (self as unknown as Worker).postMessage({ id: msg.id, type: 'result', vectors, embedder: fallback.id });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id: msg.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
