import { z } from 'zod/mini';

/**
 * In-process fake llama-server: a `fetch`-shaped handler that streams canned prose.
 * Used by the "Demo (no GPU)" provider and by `scripts/fake-backend.ts`.
 */
const CompletionBody = z.object({
  prompt: z.optional(z.string()),
  content: z.optional(z.string()),
  n_predict: z.optional(z.number()),
  id_slot: z.optional(z.number()),
  json_schema: z.optional(z.unknown()),
});
export type CompletionBody = z.infer<typeof CompletionBody>;

export interface FakeLlamaOptions {
  wordDelayMs?: number;
  onPrompt?: (prompt: string, body: CompletionBody) => void;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const LINES = [
  'The lantern flickers. Merav does not look up from the map, but her hand stops moving.',
  'Wind pushes salt under the tent flap. Somewhere behind you a camel coughs and is quiet again.',
  'You count the pinpricks twice. The second time there is one more than the first.',
  '"Don\'t," Merav says, to no one in particular, and keeps walking.',
] as const;
const NAMES = ['Merav', 'The Needle Map', 'Well-wardens', 'Ashen Flats'] as const;
const MEMORY = 'The caravan crossed the flats; Merav hid her blindness; a needle-pricked map surfaced.';
const PROPS = { default_generation_settings: { n_ctx: 8192 }, total_slots: 2, model_path: '/models/Fake-12B-Q4_K_M.gguf', build_info: 'fake' };

const json = (obj: unknown, status = 200): Response => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const sseHeaders = { ...CORS, 'content-type': 'text/event-stream' };
const evt = (o: unknown): string => `data: ${JSON.stringify(o)}\n\n`;
const oneShot = (data: unknown): Response => new Response(evt(data), { headers: sseHeaders });
const rotate = <T>(xs: readonly [T, ...T[]], i: number): T => xs[i % xs.length] ?? xs[0];

/** Streams `line` word by word, then a final stats event shaped like llama-server's. */
function stream(line: string, prompt: string, delay: number, signal: AbortSignal): Response {
  const words = line.split(' ');
  const pn = Math.ceil(prompt.length / 4);
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const step = () => {
        if (signal.aborted) return ctrl.close();
        const word = words[i];
        if (word !== undefined) {
          ctrl.enqueue(enc.encode(evt({ content: (i++ ? ' ' : '') + word })));
          timer = setTimeout(step, delay);
          return;
        }
        const cached = Math.floor(pn * 0.8);
        const timings = { prompt_ms: 120, predicted_ms: 40 * words.length, prompt_n: pn - cached, cache_n: cached, predicted_n: words.length };
        const stats = { content: '', stop: true, stop_type: 'eos', tokens_evaluated: pn, tokens_cached: pn + words.length, tokens_predicted: words.length };
        ctrl.enqueue(enc.encode(evt({ ...stats, timings })));
        ctrl.close();
      };
      timer = setTimeout(step, delay);
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  return new Response(body, { headers: sseHeaders });
}

function card(prompt: string, fallbackName: string): Response {
  const name = /name is "([^"]+)"/.exec(prompt)?.[1] ?? fallbackName;
  const lower = name.toLowerCase();
  const entry = `${name} matters to this story: a detail the caravan will not forget.`;
  const content = JSON.stringify({ name, entry, triggers: [lower, lower.split(' ')[0], 'caravan'] });
  return oneShot({ content, stop: true, stop_type: 'eos', tokens_evaluated: 120, tokens_predicted: 40 });
}

export function createFakeLlama(opts: FakeLlamaOptions = {}): (req: Request) => Promise<Response> {
  const delay = opts.wordDelayMs ?? 40;
  let n = 0; // rotates canned lines and card names

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    if (path === '/health') return json({ status: 'ok' });
    if (path === '/props') return json(PROPS);
    if (path === '/embedding') return json({ error: 'not enabled' }, 404);
    const text = req.method === 'POST' ? await req.text() : '';
    const body = CompletionBody.parse(text ? JSON.parse(text) : {});
    if (path === '/tokenize') return json({ tokens: Array.from({ length: Math.ceil((body.content ?? '').length / 4) }, (_, i) => i) });
    if (path !== '/completion') return json({ error: 'not found' }, 404);

    const prompt = body.prompt ?? '';
    opts.onPrompt?.(prompt, body);
    if (body.n_predict === 0) return json({ content: '', stop: true, tokens_evaluated: Math.ceil(prompt.length / 4), tokens_cached: 0 });
    if (body.json_schema !== undefined) return card(prompt, rotate(NAMES, n++));
    if (/Memory:\s*$|Write the updated summary:\s*$/.test(prompt)) {
      return oneShot({ content: MEMORY, stop: true, stop_type: 'eos', tokens_evaluated: 200, tokens_predicted: 20 });
    }
    return stream(rotate(LINES, n++), prompt, delay, req.signal);
  };
}
