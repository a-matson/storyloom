import { currentStates, tag } from '../memory/looks';
import type { Assertion } from '../model/types';
import { PROMPT_BUDGET } from './compose';

/** The builder's round sheet: one turnaround image of only what the player stated. */
export type SheetFamily = 'sd15' | 'sdxl';

/** One image beat three on a shared seed for keeping views alike. [measured: docs/measurements/2026-10-18-sheet-layout.json] */
export const SHEET_FRAME = 'character reference sheet, multiple views, front view, side view, back view, full body, white background';
/** About each family's native area, wide for three views. [measured: docs/measurements/2026-10-18-sheet-layout.json] */
export const SHEET_SIZE: Record<SheetFamily, { width: number; height: number }> = { sd15: { width: 768, height: 384 }, sdxl: { width: 1536, height: 640 } };
/** A sheet is one figure on white. [provisional] */
export const SHEET_NEGATIVE = 'text, watermark, scenery, multiple characters';
/**
 * Unweighted SD 1.5 lost every stated clothing and hair colour; 1.2 keeps most, 1.3 crops and loses the
 * species. SDXL binds them unweighted. [provisional: docs/measurements/2026-10-18-sheet-bar.json, Claude's labels]
 */
export const SHEET_WEIGHT: Record<SheetFamily, number> = { sd15: 1.2, sdxl: 1 };

// Clothing first: its colour leaked most. Over budget, keys go from the end; KEEP never does.
const ORDER = ['wearing', 'species', 'body', 'hair', 'eyes', 'skin', 'build', 'face', 'horns', 'scales', 'marks', 'accessories', 'palette'];
const KEEP = new Set(['wearing', 'species', 'body', 'hair', 'eyes']);
// Weighting colour alone turned a fox human, so the species is weighted with it.
const WEIGHTED = new Set(['wearing', 'species', 'hair']);

/** The checkpoint family from its name, else from the See size (SDXL's native area is 4x SD 1.5's; 768² is SDXL's floor). [provisional] */
export const familyOf = (model: string | undefined, width: number, height: number): SheetFamily =>
  /xl|pony|noob|illustrious/i.test(model ?? '') || width * height >= 768 * 768 ? 'sdxl' : 'sd15';

/** Frame and the stated keys, nothing else: no name, identity, facts or style. A skipped key adds nothing. */
export function sheetPrompt(own: readonly Assertion[], skipped: readonly string[], weight = 1, budget = PROMPT_BUDGET): string {
  const now = currentStates(own);
  // Brackets in a player's value would read as SD weights.
  const value = (k: string) => (now[k] ?? '').replace(/[()[\]]/g, '').trim();
  const part = (k: string) => (WEIGHTED.has(k) && weight !== 1 ? `(${tag(k, value(k))}:${weight})` : tag(k, value(k)));
  const text = (keys: string[]) => [SHEET_FRAME, ...keys.map(part)].join(', ');
  let keys = ORDER.filter((k) => !skipped.includes(k) && value(k) !== '');
  while (text(keys).length > budget) {
    const i = keys.findLastIndex((k) => !KEEP.has(k));
    if (i < 0) break;
    keys = keys.toSpliced(i, 1);
  }
  // ponytail: the kept keys alone can still be too long; the cut may end mid-weight, which SD reads as a plain weight.
  return text(keys).slice(0, budget);
}
