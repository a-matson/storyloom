/**
 * Start-up bundle budget: brotli size of every JS/CSS file `dist/index.html` loads up front
 * (entry script + modulepreloads + stylesheets). Lazy chunks don't count; chunk names don't matter.
 *   node scripts/size.ts
 */
import { readFileSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';

// Measured baselines + ~2%; raise only as a recorded decision.
const BUDGET_KB = { js: 128.2, css: 5.8 };

const html = readFileSync('dist/index.html', 'utf8');
const files = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.(js|css))"/g)].map(
  (m) => ({ path: `dist/${m[1] ?? ''}`, kind: m[2] === 'css' ? 'css' : 'js' }) as const,
);

let failed = false;
for (const kind of ['js', 'css'] as const) {
  const sized = files.filter((f) => f.kind === kind).map((f) => ({ path: f.path, kb: brotliCompressSync(readFileSync(f.path)).length / 1000 }));
  const total = sized.reduce((n, f) => n + f.kb, 0);
  for (const f of sized) console.log(`  ${f.path}  ${f.kb.toFixed(2)} kB`);
  const ok = total <= BUDGET_KB[kind];
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'OVER'} start-up ${kind}: ${total.toFixed(2)} kB brotli (budget ${BUDGET_KB[kind]} kB)\n`);
}
process.exitCode = failed ? 1 : 0;
