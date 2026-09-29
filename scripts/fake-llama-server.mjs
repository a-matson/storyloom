#!/usr/bin/env node
/**
 * A fake llama-server for UI work without a GPU.
 *   node scripts/fake-llama-server.mjs [port=8080]
 * Implements /health, /props, /completion (SSE), /tokenize; /embedding returns 404
 * so the app falls back to the in-browser embedder. Echoes each prompt to stdout
 * so you can eyeball what the context builder produced.
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 8080);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const lines = [
  'The lantern flickers. Merav does not look up from the map, but her hand stops moving.',
  'Wind pushes salt under the tent flap. Somewhere behind you a camel coughs and is quiet again.',
  'You count the pinpricks twice. The second time there is one more than the first.',
  '"Don\'t," Merav says, to no one in particular, and keeps walking.',
];
let n = 0;

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') return void (res.writeHead(204, cors), res.end());
    const json = (obj, code = 200) => (res.writeHead(code, { ...cors, 'content-type': 'application/json' }), res.end(JSON.stringify(obj)));
    if (req.url === '/health') return json({ status: 'ok' });
    if (req.url === '/props') return json({ default_generation_settings: { n_ctx: 8192 }, total_slots: 2, model_path: '/models/Fake-12B-Q4_K_M.gguf', build_info: 'fake' });
    if (req.url === '/embedding') return json({ error: 'not enabled' }, 404);
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = body ? JSON.parse(body) : {};
      if (req.url === '/tokenize') return json({ tokens: Array.from({ length: Math.ceil((j.content ?? '').length / 4) }, (_, i) => i) });
      if (req.url === '/completion') {
        process.stdout.write(`\n===== prompt (${(j.prompt ?? '').length} chars) =====\n${j.prompt}\n=====\n`);
        if (j.n_predict === 0) return json({ content: '', stop: true, tokens_evaluated: Math.ceil(j.prompt.length / 4), tokens_cached: 0 });
        res.writeHead(200, { ...cors, 'content-type': 'text/event-stream' });
        const words = lines[n++ % lines.length].split(' ');
        let i = 0;
        const t = setInterval(() => {
          if (i < words.length) res.write(`data: ${JSON.stringify({ content: (i ? ' ' : '') + words[i++] })}\n\n`);
          else {
            const pn = Math.ceil(j.prompt.length / 4);
            res.write(`data: ${JSON.stringify({ content: '', stop: true, stopped_eos: true, tokens_evaluated: pn, tokens_cached: Math.floor(pn * 0.8), tokens_predicted: words.length, timings: { prompt_ms: 120, predicted_ms: 40 * words.length, prompt_n: pn, predicted_n: words.length } })}\n\n`);
            clearInterval(t);
            res.end();
          }
        }, 40);
        return;
      }
      json({ error: 'not found' }, 404);
    });
  })
  .listen(port, () => console.log(`fake llama-server on http://localhost:${port}`));
