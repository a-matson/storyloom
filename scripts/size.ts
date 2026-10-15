/**
 * Start-up bundle budget: brotli size of every JS/CSS file `dist/index.html` loads up front
 * (entry script + modulepreloads + stylesheets). Lazy chunks don't count; chunk names don't matter.
 *   node scripts/size.ts
 */
import { readFileSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';

// Measured baselines + ~2%; raise only as a recorded decision.
// js: 128.98 measured 2026-10-04 (M6-2 PR 2 wired scripts into the session), user raised the budget.
// js: 131.26 measured 2026-10-04 (M7-4 put the cover thumb, and so useImageBlob, on the library screen); user raised 131.0 -> 131.5.
// js: 131.51 measured 2026-10-05 (M7-6 put read-aloud, and so useSpeech, on the first-run screen); user raised 131.5 -> 132.0.
// js: 131.88 measured 2026-10-05 (play fix 2: the failed-image state and the pendingImages prop); user raised 132.0 -> 132.5.
// css: M7-5 added the Slate theme block; user raised 5.8 -> 6.2 to leave room for one more theme.
// css: 6.18 measured 2026-10-05 (play fix 6: the mode-coloured focus ring); user raised 6.2 -> 6.5.
// js: 132.08 measured 2026-10-06 (play fix 7: the toast's own dismiss timer); user raised 132.5 -> 133.0.
// js: 132.77 measured 2026-10-06 (M9-1a: the Entity schema, its Dexie table, projectEntity); user raised 133.0 -> 133.5.
// js: 133.58 measured 2026-10-06 (M9-W1-1: the Scene schema and its prompt line; main was 133.37); user raised 133.5 -> 134.0.
// js: 134.22 measured 2026-10-06 (M9-W1-2: structured blocks and fact ranking on the turn path); user raised 134.0 -> 135.0.
// 2026-10-07: user set M9 headroom once (js 135.0 -> 140.0, css 6.5 -> 7.0) so M9 items stop asking per PR;
// report `pnpm size` in the PR body and ask only when OVER. Re-baseline (measured + ~2%) at the start of M10.
// 2026-10-11: re-baselined at js 140.92 / css 6.44 measured (M12-1 PR 1: state facts and looks on the entity drawer); user chose it over a one-off raise.
// js: 143.77 measured 2026-10-11 (M12-1 PR 4: the one-line JSON ask in the entity prompts); user raised 143.7 -> 144.5.
// js: 144.98 measured 2026-10-11 (M12-5: items in the scene line); user raised 144.5 -> 145.5.
// js: 145.76 measured 2026-10-12 (M12-2: cast lines in the context builder); user raised 145.5 -> 146.0.
// js: 146.01 measured 2026-10-12 (M12-10: repeat window and DRY); user raised 146.0 -> 146.5.
// js: 146.67 measured 2026-10-13 (M13-2a: Assertion schema in the adventure parse); user raised 146.5 -> 147.5 for all of M13-2.
// js: 147.84 measured 2026-10-14 (M13-6: a lazy-only Setup change moved it 147.70 -> 147.84 through renamed chunk hashes in the
// entry's preload list); user raised 147.8 -> 148.0.
// js: 148.14 measured 2026-10-14 (M13-10: witnessed-by in the context builder); user raised 148.0 -> 148.5.
// js: 148.78 measured 2026-10-15 (M14-S3: secret lines and memory marks in the context builder); user raised 148.5 -> 149.5.
const BUDGET_KB = { js: 149.5, css: 6.6 };

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
