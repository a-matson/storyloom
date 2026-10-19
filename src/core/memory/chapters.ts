import type { PlotComponents } from '../model/types';

/** Actions a chapter runs before a scene move closes it. [provisional] */
export const CHAPTER_MIN = 10;

export type Chapter = NonNullable<PlotComponents['chapters']>[number];
type Read = Pick<PlotComponents, 'sceneLog' | 'chapters'>;

/**
 * Where each chapter starts, in order: action 0, every stored entry (a `/chapter` mark or a titled start), and every
 * scene move `CHAPTER_MIN` or more actions after the last start. Titles are stored only at starts, so storing one moves none.
 */
export function chapterStarts(plot: Read): Chapter[] {
  const stored = new Map((plot.chapters ?? []).map((c) => [c.at, c]));
  const ats = [...new Set([0, ...stored.keys(), ...(plot.sceneLog ?? []).map((s) => s.at)])].toSorted((a, b) => a - b);
  const starts: Chapter[] = [];
  for (const at of ats) {
    const last = starts.at(-1)?.at;
    if (last === undefined || stored.has(at) || at - last >= CHAPTER_MIN) starts.push(stored.get(at) ?? { at });
  }
  return starts;
}

/** Index of the chapter action `at` belongs to. */
export const chapterOf = (starts: readonly Chapter[], at: number): number => starts.findLastIndex((c) => c.at <= at);

/** `chapters` with the entry at `entry.at` replaced or added, sorted by start. */
export const withChapter = (chapters: readonly Chapter[] | undefined, entry: Chapter): Chapter[] =>
  [...(chapters ?? []).filter((c) => c.at !== entry.at), entry].toSorted((a, b) => a.at - b.at);

/** Confirmed titles of the chapters starting in `[from, to)`. */
export const chapterTitles = (plot: Read, from: number, to: number): string[] =>
  chapterStarts(plot).flatMap((c) => (c.at >= from && c.at < to && c.title && c.seen !== false ? [c.title] : []));
