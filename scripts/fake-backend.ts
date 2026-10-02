/**
 * Fake llama-server for UI work without a GPU: `pnpm fake-backend [port=8080]`.
 * Echoes every prompt to stdout so you can eyeball what the context builder produced.
 */
import { serve } from 'srvx';
import { createFakeLlama } from '../src/providers/demo/fakeLlama.ts';

const port = Number(process.argv[2] ?? 8080);
const handler = createFakeLlama({
  onPrompt: (prompt, body) => {
    const b = body as { id_slot?: number; n_predict?: number };
    process.stdout.write(`\n===== prompt (${prompt.length} chars) slot=${b.id_slot ?? '-'} n_predict=${b.n_predict} =====\n${prompt}\n=====\n`);
  },
});
serve({ port, fetch: handler });
