/**
 * `pnpm measure <scenario> [args]`: one entry point for every measurement; JSON lands in docs/measurements/.
 *   core                  micro-benchmarks of src/core (same as `pnpm bench`)
 *   renders [label]       React commits/render ms for 3 turns, prod build with the Profiler
 *   latency <url> [turns] TTFT, cache hit %, tok/s against a live backend (cold vs cached prefix)
 *   gatev <url>           llama-server checks: template, tokenizer error, warming, layout, evictionChunk, CORS
 *   live <url> [label]    plays 20 scripted turns in the real app; per-turn stats, memories, summary
 *   images <image-url> <url>  See mode and a cover against a real A1111 server
 *   recall <url> [label]  plants 12 facts and probes them at turns 30/60/90; the memory recall baseline
 */
import { spawnSync } from 'node:child_process';

const [scenario, a, b] = process.argv.slice(2);
const SCENARIOS: Record<string, { cmd: string[]; env?: Record<string, string | undefined> }> = {
  core: { cmd: ['pnpm', 'bench'] },
  renders: { cmd: ['pnpm', 'measure:renders'], env: { MEASURE_LABEL: a } },
  latency: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/latency'], env: { MEASURE_URL: a, MEASURE_TURNS: b } },
  gatev: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/gatev'], env: { MEASURE_URL: a } },
  // `--project=live`, not `--project live`: the flag is variadic and would swallow the file.
  live: { cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/play.spec.ts'], env: { MEASURE_URL: a, MEASURE_LABEL: b } },
  images: { cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/images.spec.ts'], env: { MEASURE_IMAGES: a, MEASURE_URL: b } },
  recall: { cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/recall.spec.ts'], env: { MEASURE_URL: a, MEASURE_LABEL: b } },
};

const s = scenario === undefined ? undefined : SCENARIOS[scenario];
if (!s || (scenario !== 'core' && scenario !== 'renders' && !a) || (scenario === 'images' && !b)) {
  console.error(`usage: pnpm measure <${Object.keys(SCENARIOS).join('|')}> [args]  (latency, gatev and live need a backend url; images needs both)`);
  process.exit(2);
}
const [cmd = '', ...args] = s.cmd;
const env = Object.fromEntries(Object.entries({ ...process.env, ...s.env }).filter(([, v]) => v !== undefined));
process.exit(spawnSync(cmd, args, { stdio: 'inherit', env }).status ?? 1);
