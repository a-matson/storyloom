/**
 * `pnpm measure <scenario> [args]`: one entry point for every measurement; JSON lands in docs/measurements/.
 *   core                  micro-benchmarks of src/core (same as `pnpm bench`)
 *   renders [label]       React commits/render ms for 3 turns, prod build with the Profiler
 *   latency <url> [turns] TTFT, cache hit %, tok/s against a live backend (cold vs cached prefix)
 *   gatev <url>           llama-server checks: template, tokenizer error, warming, layout, evictionChunk, CORS
 *   memory-keep <url> [label]  does the memory for each planted Do/Say keep the fact? (recorded history, ~16 calls)
 *   contradiction <url> [label] [cases]  precision/recall of the contradiction check on hand-labelled outputs (cases: comma-separated files;
 *     MEASURE_SCOPE=locked drops the Scene: lines, as with the setting off)
 *   contradiction-cases <backups> [file]  unlabelled check cases from backups' AI outputs (bench/contradiction-dogfood.json), no model
 *   memory-replay <url> <backup> <from-to> [label] [samples]  the memory for one action range of a backup, written [samples] times (default 5)
 *   state <url> <backup> [label] [labels-set]  scene and state reads over every AI turn of a backup, scored against bench/stateLabels.json
 *   probe <url> <backup> <at> [label] [samples]  the reply to player action <at>, drawn [samples] times (default 3); graded by hand
 *   redact <backup> [label]  secret cuts in the prompt before every AI output (MEASURE_SECRET as for probe), no model
 *   voice <url> <backup> <batch.json> [label] [samples]  say turns replayed without and with the batch's voices; top speakers' lines, rated by hand
 *   spotlight <url> <backup> [label] [points]  crowded scenes (4–5 present) continued per cast order; who the speaker guess labels
 *   initiative <url> <backup> [label] [points]  3+ present continued without and with confirmed goals (`wants:`); who speaks, gate flags
 *   migrate <backup> [label]  entity facts to typed assertions: counts kept, dropped (conflicts on unlocked keys, stale spans), lost
 *   names <backups> [label]  new-name candidates and kinds, action by action, no model (backups comma-separated)
 *   speakers <backup> [label]  the speaker guess and the batch's stored speakers against bench/speakerLabels.json, no model
 *   summary <url> <backup> [label]  the summary refreshed 10 times over a backup's memories from nothing; how many changed it
 *   gate <backup> [label]  the output gate (empty, verbatim, agency) over every AI output, first and kept version, no model
 *   cast-facts <backups> [label]  the facts each player action sends for the absent it names (M19-1), no model
 *   live <url> [label]  plays 20 scripted turns in the real app; per-turn stats, memories, summary
 *   repetition <url> [label]  the live turns alone: repeated phrases per turn, distinct 4-grams (MEASURE_SAMPLERS=64,0 for the "before")
 *   images <image-url> <url>  See mode and a cover against a real A1111 server
 *   sheet <image-url> [label]  builder round sheets of two characters x 5 seeds on the loaded checkpoint (MEASURE_WEIGHT, MEASURE_SIZE=w,h, MEASURE_CLIP)
 *   reference <image-url> [label]  two Sees of five built characters, text only vs img2img from the sheet (MEASURE_DENOISE, MEASURE_STEPS)
 *   recall-record <url>   plays the 24-fact scenario to turn 90 once and saves the history (bench/recall-history.json)
 *   recall <url> [label]  replays the recorded history and generates only the probes at turns 30/60/90 (~75 min); the memory recall baseline
 *     both: MEASURE_HISTORY=<file> another recording (bench/recall-history-300.json); MEASURE_DEPTHS=30,90,180,270 the depths
 *     (record plays to the deepest); MEASURE_BANK_SIZE=<n> caps the bank on each replayed slice
 */
import { spawnSync } from 'node:child_process';

const [scenario, a, b, c, d] = process.argv.slice(2);
const SCENARIOS: Record<string, { cmd: string[]; env?: Record<string, string | undefined> }> = {
  core: { cmd: ['pnpm', 'bench'] },
  renders: { cmd: ['pnpm', 'measure:renders'], env: { MEASURE_LABEL: a } },
  latency: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/latency'], env: { MEASURE_URL: a, MEASURE_TURNS: b } },
  redact: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/redact'], env: { MEASURE_BACKUP: a, MEASURE_LABEL: b } },
  gatev: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/gatev'], env: { MEASURE_URL: a } },
  'memory-keep': {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/memoryKeep'],
    env: { MEASURE_URL: a, MEASURE_LABEL: b },
  },
  contradiction: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/contradiction.bench'],
    env: { MEASURE_URL: a, MEASURE_LABEL: b, MEASURE_CASES: c },
  },
  'contradiction-cases': {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/contradictionCases'],
    env: { MEASURE_BACKUP: a, MEASURE_CASES: b },
  },
  'memory-replay': {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/memoryReplay'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_RANGE: c, MEASURE_LABEL: d, MEASURE_SAMPLES: process.argv[7] },
  },
  state: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/state.bench'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_LABEL: c, MEASURE_LABELS: d },
  },
  probe: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/probe'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_AT: c, MEASURE_LABEL: d, MEASURE_SAMPLES: process.argv[7] },
  },
  voice: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/voice'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_VOICES: c, MEASURE_LABEL: d, MEASURE_SAMPLES: process.argv[7] },
  },
  spotlight: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/spotlight'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_LABEL: c, MEASURE_POINTS: d },
  },
  initiative: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/initiative'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_LABEL: c, MEASURE_POINTS: d },
  },
  migrate: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/migrate'],
    env: { MEASURE_BACKUP: a, MEASURE_LABEL: b },
  },
  names: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/names'],
    env: { MEASURE_BACKUP: a, MEASURE_LABEL: b },
  },
  speakers: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/speakers'],
    env: { MEASURE_BACKUP: a, MEASURE_LABEL: b },
  },
  summary: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/summary'],
    env: { MEASURE_URL: a, MEASURE_BACKUP: b, MEASURE_LABEL: c },
  },
  gate: {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/gate.bench'],
    env: { MEASURE_BACKUP: a, MEASURE_LABEL: b },
  },
  'cast-facts': {
    cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/castFacts'],
    env: { MEASURE_BACKUP: a, MEASURE_LABEL: b },
  },
  // `--project=live`, not `--project live`: the flag is variadic and would swallow the file.
  live: { cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/play.spec.ts'], env: { MEASURE_URL: a, MEASURE_LABEL: b } },
  repetition: {
    cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/repetition.spec.ts'],
    env: { MEASURE_URL: a, MEASURE_LABEL: b },
  },
  images: { cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/images.spec.ts'], env: { MEASURE_IMAGES: a, MEASURE_URL: b } },
  sheet: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/sheet'], env: { MEASURE_IMAGES: a, MEASURE_LABEL: b } },
  reference: { cmd: ['pnpm', 'exec', 'vitest', 'run', '--config', 'bench/vitest.config.ts', 'bench/reference'], env: { MEASURE_IMAGES: a, MEASURE_LABEL: b } },
  'recall-record': {
    cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/recall.spec.ts'],
    env: { MEASURE_URL: a, MEASURE_MODE: 'record' },
  },
  recall: {
    cmd: ['pnpm', 'exec', 'playwright', 'test', '--project=live', 'e2e/live/recall.spec.ts'],
    env: { MEASURE_URL: a, MEASURE_LABEL: b, MEASURE_MODE: 'replay' },
  },
};

const s = scenario === undefined ? undefined : SCENARIOS[scenario];
if (!s || (scenario !== 'core' && scenario !== 'renders' && !a) || (scenario === 'images' && !b)) {
  console.error(`usage: pnpm measure <${Object.keys(SCENARIOS).join('|')}> [args]  (latency, gatev and live need a backend url; images needs both)`);
  process.exit(2);
}
const [cmd = '', ...args] = s.cmd;
const env = Object.fromEntries(Object.entries({ ...process.env, ...s.env }).filter(([, v]) => v !== undefined));
process.exit(spawnSync(cmd, args, { stdio: 'inherit', env }).status ?? 1);
