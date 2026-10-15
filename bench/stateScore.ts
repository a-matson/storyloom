import { z } from 'zod/mini';

const at = z.int().check(z.gte(0));
const Span = { from: at, to: at };

/** Hand labels for one adventure backup: where the scene is and who is there after action i, and a few state values. */
export const LabelSet = z.object({
  /** The scene before the first read. */
  start: z.string(),
  place: z.array(z.object({ ...Span, place: z.string() })),
  present: z.array(z.object({ ...Span, names: z.array(z.string()) })),
  /** Words that map a free-text location to a labelled place; the first place with a matching word wins. */
  placeWords: z.record(z.string(), z.array(z.string())),
  checkpoints: z.array(z.object({ at, who: z.string(), key: z.string(), value: z.string() })),
});
export type LabelSet = z.output<typeof LabelSet>;
const Labels = z.object({ sets: z.record(z.string(), LabelSet) });

export function pickSet(json: unknown, name: string): LabelSet {
  const set = Labels.parse(json).sets[name];
  if (!set) throw new Error(`no label set "${name}"`);
  return set;
}

export function placeOf(location: string, placeWords: LabelSet['placeWords']): string {
  const t = location.toLowerCase();
  return Object.entries(placeWords).find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? t;
}

export const presentOk = (want: readonly string[], got: readonly string[]) => want.length === got.length && want.every((w) => got.includes(w));

/** One replayed turn: action index, the cast known by then, and what the reads made of it. */
export interface StateRow {
  i: number;
  cast: readonly string[];
  location?: string | undefined;
  present: readonly string[];
  /** Read B's record after this turn: who -> key -> value. */
  record?: Record<string, Record<string, string>>;
}

const labelAt = <T extends { from: number; to: number }>(spans: readonly T[], i: number) => spans.find((s) => s.from <= i && i <= s.to);

/** `MEASURE_ONLY=43-44` (or `43`): the action range to replay; undefined replays all. */
export function onlySpan(s: string | undefined): { from: number; to: number } | undefined {
  const m = s?.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return undefined;
  const from = Number(m[1]);
  return { from, to: Number(m[2] ?? from) };
}

/** The labelled scene after action i, so a filtered replay starts where the play stood. */
export function sceneAt(set: LabelSet, i: number): { location: string; present: string[] } {
  const place = labelAt(set.place, i)?.place ?? '';
  return { location: placeOf(set.start, set.placeWords) === place ? set.start : place, present: [...(labelAt(set.present, i)?.names ?? [])] };
}

/** One replayed turn's leavers: the labelled ones, what each sample read gave (null: unparsed), and each sample's ms. */
export interface LeftRow {
  want: readonly string[];
  samples: readonly (readonly string[] | null)[];
  ms: readonly number[];
}

/** M14-S2's bar: samples naming every labelled leaver, over the turns where someone left; and the median read time. */
export function scoreLeft(rows: readonly LeftRow[]) {
  const counted = rows.filter((r) => r.want.length > 0);
  const ms = rows.flatMap((r) => r.ms).toSorted((x, y) => x - y);
  return {
    leftOk: counted.flatMap((r) => r.samples.filter((s) => s !== null && r.want.every((w) => s.includes(w)))).length,
    leftSamples: counted.reduce((n, r) => n + r.samples.length, 0),
    medianMsA: ms[Math.floor(ms.length / 2)] ?? 0,
  };
}

/** Who the labels say left between actions `before` and `i`. */
export function leftWanted(set: LabelSet, before: number, i: number): string[] {
  const now = labelAt(set.present, i)?.names ?? [];
  return (labelAt(set.present, before)?.names ?? []).filter((n) => !now.includes(n));
}

export function scoreRows(rows: readonly StateRow[], set: LabelSet) {
  const ok = rows.map((r) => {
    const want = (labelAt(set.present, r.i)?.names ?? []).filter((n) => r.cast.includes(n));
    return {
      place: r.location !== undefined && placeOf(r.location, set.placeWords) === labelAt(set.place, r.i)?.place,
      present: presentOk(want, r.present),
    };
  });
  const checkpointsOk = set.checkpoints.filter((c) => {
    const row = rows.findLast((r) => r.i <= c.at);
    return row?.record?.[c.who]?.[c.key]?.toLowerCase().includes(c.value.toLowerCase()) ?? false;
  }).length;
  return {
    turns: rows.length,
    placeOk: ok.filter((o) => o.place).length,
    presentOk: ok.filter((o) => o.present).length,
    checkpointsOk,
    checkpoints: set.checkpoints.length,
  };
}
