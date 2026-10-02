import { test } from 'vitest';
import { z } from 'zod/mini';
import { fetchJson } from '@adapters/providers/http';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import type { Adventure } from '@core/model/types';
import { renderTemplate } from '@core/text/templates';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { buildWarmupPrompt, prepareContext, type TurnDeps } from '@core/turn';
import { makeAdventure } from '../tests/fixtures/adventure';
import { writeMeasurement } from './env';

// Gate V-1 against a live llama-server: `pnpm measure gatev <url>`; skipped otherwise.
const url = process.env['MEASURE_URL'];
const CTX = 2048; // small enough that history evicts and cold prefills stay quick; hit % is a ratio
const ORIGIN = 'https://a-matson.github.io';

// Raw timings, not the adapter's stats: `cache_n` is the reused prefix, `prompt_n` only the newly evaluated tokens.
const Timings = z.object({
  timings: z.object({ cache_n: z.number(), prompt_n: z.number(), prompt_ms: z.number(), predicted_n: z.number(), predicted_ms: z.number() }),
});
const Props = z.object({
  chat_template: z.string(),
  total_slots: z.number(),
  model_path: z.string(),
  default_generation_settings: z.object({ n_ctx: z.number() }),
});
const Applied = z.object({ prompt: z.string() });

const post = <T>(path: string, body: unknown, schema: z.ZodMiniType<T>) =>
  fetchJson(fetch, `${url}${path}`, schema, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function run(prompt: string, extra: Record<string, unknown> = {}) {
  const { timings: t } = await post('/completion', { prompt, n_predict: 8, temperature: 0, seed: 1, cache_prompt: true, id_slot: 0, ...extra }, Timings);
  const total = t.cache_n + t.prompt_n;
  return {
    ttftMs: Math.round(t.prompt_ms),
    hit: total > 0 ? t.cache_n / total : 0,
    promptTokens: total,
    tokPerS: t.predicted_ms > 0 ? t.predicted_n / (t.predicted_ms / 1000) : undefined,
  };
}

function adventure(cacheStableLayout = true, evictionChunk = 8, contextLength = CTX, seed = 7): Adventure {
  const adv = makeAdventure({ actions: 140, cards: 10, seed });
  const s = adv.settings;
  adv.settings = { ...s, template: 'chatml', model: { ...s.model, contextLength }, context: { ...s.context, cacheStableLayout, evictionChunk } };
  return adv;
}

const deps = (): TurnDeps => ({ provider: new LlamaServerProvider('gatev', url ?? ''), tokenizer: createApproxTokenizer() });

/** Prompt of turn `t`: the log up to the t-th player action past index 40 (history already overflows CTX). */
async function turnPrompt(adv: Adventure, t: number, warm: boolean) {
  const ends = adv.actions.flatMap((a, i) => (a.type === 'do' && i >= 40 ? [i + 1] : []));
  const actions = adv.actions.slice(0, ends[t]);
  const warmup = warm ? await buildWarmupPrompt(adv, actions.slice(0, -1), deps()) : null;
  const p = await prepareContext(adv, actions, deps());
  if ('stopped' in p) throw new Error(p.stopped);
  return { prompt: p.prompt, warmup, system: p.result.system, body: p.result.body };
}

async function series(label: string, adv: Adventure, turns: number, mode: 'cold' | 'cached' | 'warm' = 'cached') {
  // A unique head per series: llama-server's RAM prompt cache would otherwise restore another series' identical prompt.
  const nonce = `${label} ${Date.now()}\n`;
  const rows = [];
  for (let t = 0; t < turns; t++) {
    const { prompt, warmup } = await turnPrompt(adv, t, mode === 'warm');
    if (warmup) await run(nonce + warmup, { n_predict: 0 });
    rows.push({ series: label, turn: t, ...(await run(nonce + prompt, { cache_prompt: mode !== 'cold' })) });
  }
  console.table(rows);
  return rows;
}

/** Means over turns 1+ (turn 0 always starts from an evicted slot). */
function summary(rows: Awaited<ReturnType<typeof series>>) {
  return [...new Set(rows.map((r) => r.series))].map((label) => {
    const tail = rows.filter((r) => r.series === label && r.turn > 0);
    const mean = (f: (r: (typeof tail)[number]) => number) => tail.reduce((n, r) => n + f(r), 0) / tail.length;
    return { series: label, meanHit: mean((r) => r.hit), meanTtftMs: Math.round(mean((r) => r.ttftMs)), meanTokPerS: mean((r) => r.tokPerS ?? 0) };
  });
}

async function templateCase() {
  const props = await fetchJson(fetch, `${url}/props`, Props);
  const { system, body } = await turnPrompt(adventure(), 0, false);
  const cases = [];
  for (const prefix of ['', 'The']) {
    const messages = [{ role: 'system', content: system }, { role: 'user', content: body }, ...(prefix ? [{ role: 'assistant', content: prefix }] : [])];
    const theirs = (await post('/apply-template', { messages }, Applied)).prompt;
    const ours = renderTemplate('chatml', system, body, prefix).prompt;
    const firstDiff = Array.from({ length: Math.max(ours.length, theirs.length) }, (_, i) => i).find((i) => ours[i] !== theirs[i]) ?? -1;
    cases.push({ messages: messages.length, match: ours === theirs, firstDiff, ours: ours.slice(-80), theirs: theirs.slice(-80) });
  }
  const { chat_template, ...rest } = props;
  return { props: { ...rest, chatTemplateHasImStart: chat_template.includes('<|im_start|>') }, cases };
}

async function tokenizerCase() {
  const provider = new LlamaServerProvider('gatev', url ?? '');
  const samples: string[] = [];
  for (let i = 0; i < 30; i++) {
    const adv = makeAdventure({ actions: 2 + i * 4, cards: 0, seed: i + 1 });
    samples.push(i % 2 ? (await turnPrompt(adventure(true, 8, 512 + i * 256, i + 1), 0, false)).prompt : adv.actions.map((a) => a.versions[0]).join('\n'));
  }
  const real = await Promise.all(samples.map(async (s) => (await provider.tokenize(s)).length));
  const learned = createApproxTokenizer();
  samples.forEach((s, i) => (real[i] ?? 0) > 200 && learned.calibrate(s, real[i] ?? 0)); // same gate as the session
  const errs = (tk: ReturnType<typeof createApproxTokenizer>) => samples.map((s, i) => Math.abs(tk.count(s) - (real[i] ?? 0)) / (real[i] ?? 1));
  const stats = (e: number[]) => ({ mean: e.reduce((a, b) => a + b, 0) / e.length, max: Math.max(...e) });
  const rows = samples.map((s, i) => ({ chars: s.length, real: real[i], heuristic: createApproxTokenizer().count(s), calibrated: learned.count(s) }));
  console.table(rows);
  return { learnedCharsPerToken: learned.charsPerToken, before: stats(errs(createApproxTokenizer())), after: stats(errs(learned)), rows };
}

async function corsCase() {
  const pre = await fetch(`${url}/completion`, {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  const get = await fetch(`${url}/health`, { headers: { Origin: ORIGIN } });
  const h = (r: Response, k: string) => r.headers.get(k);
  return {
    preflight: {
      status: pre.status,
      allowOrigin: h(pre, 'access-control-allow-origin'),
      allowHeaders: h(pre, 'access-control-allow-headers'),
      allowPrivateNetwork: h(pre, 'access-control-allow-private-network'),
    },
    health: { status: get.status, allowOrigin: h(get, 'access-control-allow-origin') },
  };
}

// One test (and one JSON file) per case so a slow or failed case does not lose the others.
const LONG = 1_800_000;

test.skipIf(!url)('template, tokenizer, CORS', async () => {
  const template = await templateCase();
  const tokenizer = await tokenizerCase();
  const cors = await corsCase();
  console.log(JSON.stringify({ template, tokenizer: { ...tokenizer, rows: undefined }, cors }, null, 2));
  console.log(writeMeasurement('gatev-static', { url, template, tokenizer, cors }));
});

test.skipIf(!url)('TTFT cold / cached / warm', { timeout: LONG }, async () => {
  const rows = [
    ...(await series('cold', adventure(), 5, 'cold')),
    ...(await series('cached', adventure(), 5)),
    ...(await series('warm', adventure(), 5, 'warm')),
  ];
  console.table(summary(rows));
  console.log(writeMeasurement('gatev-ttft', { url, ctx: CTX, summary: summary(rows), rows }));
});

test.skipIf(!url)('layout: cache-stable vs AID order', { timeout: LONG }, async () => {
  const rows = [...(await series('cache-stable', adventure(true), 10)), ...(await series('aid-order', adventure(false), 10))];
  console.table(summary(rows));
  console.log(writeMeasurement('gatev-layout', { url, ctx: CTX, summary: summary(rows), rows }));
});

test.skipIf(!url)('evictionChunk 1 / 4 / 8 / 16', { timeout: LONG }, async () => {
  const rows = [];
  for (const chunk of [1, 4, 8, 16]) rows.push(...(await series(`chunk-${chunk}`, adventure(true, chunk), 20)));
  console.table(summary(rows));
  console.log(writeMeasurement('gatev-eviction', { url, ctx: CTX, summary: summary(rows), rows }));
});
