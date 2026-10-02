import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBED_MODEL, EmbedRequest, Vectors, type EmbedReply } from './protocol';

// Local only: model files are user-supplied under public/models/<id>/.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${import.meta.env.BASE_URL}models/`;
// Transformers.js points ONNX Runtime at a CDN; unset, ORT loads the wasm Vite emits next to this worker.
const wasm = env.backends.onnx.wasm;
if (!wasm) throw new Error('ONNX Runtime wasm backend unavailable');
delete wasm.wasmPaths;

let extractor: Promise<FeatureExtractionPipeline> | undefined;
const load = () => (extractor ??= pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' }));
const post = (reply: EmbedReply) => postMessage(reply, {});

async function handle(data: unknown): Promise<void> {
  const req = EmbedRequest.safeParse(data);
  if (!req.success) return post({ type: 'error', message: `bad request: ${req.error.message}` });
  const msg = req.data;
  try {
    const fx = await load();
    if (msg.type === 'init') return post({ type: 'ready' });
    // bge uses the CLS token as the sentence vector.
    const out = await fx(msg.texts, { pooling: 'cls', normalize: true });
    post({ type: 'result', id: msg.id, vectors: Vectors.parse(out.tolist()) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    post(msg.type === 'embed' ? { type: 'error', id: msg.id, message } : { type: 'error', message });
  }
}

addEventListener('message', (e: MessageEvent) => void handle(e.data));
