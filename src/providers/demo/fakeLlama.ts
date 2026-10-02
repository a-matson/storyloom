/**
 * In-process fake llama-server: a `fetch`-shaped handler that streams canned prose.
 * Used by the "Demo (no GPU)" provider and by `scripts/fake-backend.ts`.
 */
export interface FakeLlamaOptions {
  wordDelayMs?: number;
  onPrompt?: (prompt: string, body: unknown) => void;
}

interface Body {
  prompt?: string;
  content?: string;
  n_predict?: number;
  id_slot?: number;
  json_schema?: unknown;
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
];
const NAMES = ['Merav', 'The Needle Map', 'Well-wardens', 'Ashen Flats'];
const MEMORY = 'The caravan crossed the flats; Merav hid her blindness; a needle-pricked map surfaced.';

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
const sseHeaders = { ...CORS, 'content-type': 'text/event-stream' };
const evt = (o: unknown): string => `data: ${JSON.stringify(o)}\n\n`;

export function createFakeLlama(opts: FakeLlamaOptions = {}): (req: Request) => Promise<Response> {
  const delay = opts.wordDelayMs ?? 40;
  let n = 0; // rotates canned lines and card names

  const oneShot = (data: unknown): Response => new Response(evt(data), { headers: sseHeaders });

  function stream(prompt: string, signal: AbortSignal): Response {
    const words = (LINES[n++ % LINES.length] as string).split(' ');
    const pn = Math.ceil(prompt.length / 4);
    const enc = new TextEncoder();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        const step = () => {
          if (signal.aborted) return ctrl.close();
          if (i < words.length) {
            ctrl.enqueue(enc.encode(evt({ content: (i ? ' ' : '') + words[i++] })));
            timer = setTimeout(step, delay);
            return;
          }
          const stats = {
            content: '',
            stop: true,
            stopped_eos: true,
            tokens_evaluated: pn,
            tokens_cached: Math.floor(pn * 0.8),
            tokens_predicted: words.length,
          };
          ctrl.enqueue(
            enc.encode(
              evt({
                ...stats,
                timings: {
                  prompt_ms: 120,
                  predicted_ms: 40 * words.length,
                  prompt_n: pn,
                  predicted_n: words.length,
                },
              }),
            ),
          );
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

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    if (path === '/health') return json({ status: 'ok' });
    if (path === '/props')
      return json({
        default_generation_settings: { n_ctx: 8192 },
        total_slots: 2,
        model_path: '/models/Fake-12B-Q4_K_M.gguf',
        build_info: 'fake',
      });
    if (path === '/embedding') return json({ error: 'not enabled' }, 404);
    const text = req.method === 'POST' ? await req.text() : '';
    const j = (text ? JSON.parse(text) : {}) as Body;
    if (path === '/tokenize')
      return json({
        tokens: Array.from({ length: Math.ceil((j.content ?? '').length / 4) }, (_, i) => i),
      });
    if (path !== '/completion') return json({ error: 'not found' }, 404);

    const prompt = j.prompt ?? '';
    opts.onPrompt?.(prompt, j);
    if (j.n_predict === 0)
      return json({
        content: '',
        stop: true,
        tokens_evaluated: Math.ceil(prompt.length / 4),
        tokens_cached: 0,
      });
    if (j.json_schema) {
      const name = /name is "([^"]+)"/.exec(prompt)?.[1] ?? (NAMES[n++ % NAMES.length] as string);
      const lower = name.toLowerCase();
      const card = {
        name,
        entry: `${name} matters to this story: a detail the caravan will not forget.`,
        triggers: [lower, lower.split(' ')[0], 'caravan'],
      };
      return oneShot({
        content: JSON.stringify(card),
        stop: true,
        stopped_eos: true,
        tokens_evaluated: 120,
        tokens_predicted: 40,
      });
    }
    if (/Memory:\s*$|Write the updated summary:\s*$/.test(prompt))
      return oneShot({
        content: MEMORY,
        stop: true,
        stopped_eos: true,
        tokens_evaluated: 200,
        tokens_predicted: 20,
      });
    return stream(prompt, req.signal);
  };
}
