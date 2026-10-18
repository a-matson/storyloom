import type { Assertion } from '../model/types';
import { currentStates, SHEET_KEYS } from './looks';

/** The character builder's checklist: which keys to ask, and when a character is done. */
export type SheetKey = (typeof SHEET_KEYS)[number];

export const REQUIRED: ReadonlySet<SheetKey> = new Set(['species', 'build', 'skin', 'eyes', 'hair', 'face', 'wearing']);
/** Fewer words than this is vague: hair wants a colour and a style, clothing a few pieces. Others 1. [provisional] */
export const MIN_WORDS: Partial<Record<SheetKey, number>> = { hair: 2, wearing: 3 };
/** Questions per round. [provisional] */
export const ROUND = 3;

export type KeyStatus = 'filled' | 'vague' | 'missing';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
export const statusOf = (now: Record<string, string>, k: SheetKey): KeyStatus => {
  const v = now[k]?.trim() ?? '';
  return !v ? 'missing' : words(v) < (MIN_WORDS[k] ?? 1) ? 'vague' : 'filled';
};

/** The next round: missing keys before vague ones, required before optional, `SHEET_KEYS` order within each. */
export function nextQuestions(own: readonly Assertion[], skipped: readonly string[], n = ROUND): SheetKey[] {
  const now = currentStates(own);
  const open = SHEET_KEYS.filter((k) => !skipped.includes(k));
  const rank = (k: SheetKey) => (statusOf(now, k) === 'missing' ? 0 : 2) + (REQUIRED.has(k) ? 0 : 1);
  return open
    .filter((k) => statusOf(now, k) !== 'filled')
    .toSorted((a, b) => rank(a) - rank(b))
    .slice(0, n);
}

/** Every required key is answered (vague counts) or skipped. */
export function isComplete(own: readonly Assertion[], skipped: readonly string[]): boolean {
  const now = currentStates(own);
  return [...REQUIRED].every((k) => skipped.includes(k) || statusOf(now, k) !== 'missing');
}
