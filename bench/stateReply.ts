import { applyChanges, type StateUpdate } from '@core/memory/stateRead';
import type { Adventure } from '@core/model/types';
import { stateRead, type StateAsk } from '@core/schema/extraction';

/** One helper reply of the state bench, as a row records it. */
export interface Reply {
  ms: number;
  promptMs?: number | undefined;
  cachedTokens?: number | undefined;
  tokens?: number | undefined;
  stop?: string | undefined;
  raw: string;
  parsed?: boolean;
  accepted?: number;
  rejected?: StateUpdate['rejected'];
}

export const parses = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
const count = (bs: Reply[], keep: (reason: string) => boolean) => bs.reduce((s, x) => s + (x.rejected?.filter((y) => keep(y.reason)).length ?? 0), 0);

/** The state bench's reply and cast totals over its rows. */
export function replyTotals(rows: { a: Reply; b?: Reply; present: readonly string[]; location?: string | undefined; structured: { tokens: number } }[]) {
  const bs = rows.flatMap((r) => (r.b ? [r.b] : []));
  return {
    // The bar: ≤ 4 location strings.
    locations: new Set(rows.flatMap((r) => r.location ?? [])).size,
    cutReplies: [...rows.map((r) => r.a), ...bs].filter((x) => x.stop === 'length').length,
    // C9: a utility model below 28/30 parsed fails the JSON bar.
    parsedA: rows.filter((r) => r.a.parsed).length,
    parsedB: bs.filter((x) => x.parsed).length,
    meanMsA: mean(rows.map((r) => r.a.ms)),
    meanMsB: mean(bs.map((x) => x.ms)),
    // M17-1's bar: helper time per turn, both reads (one call under `AB`).
    meanMsTurn: mean(rows.map((r) => r.a.ms + (r.b?.ms ?? 0))),
    meanPromptMsA: mean(rows.flatMap((r) => r.a.promptMs ?? [])),
    meanPromptMsB: mean(bs.flatMap((x) => x.promptMs ?? [])),
    meanCachedA: mean(rows.flatMap((r) => r.a.cachedTokens ?? [])),
    meanCachedB: mean(bs.flatMap((x) => x.cachedTokens ?? [])),
    // C8: above 20 % the next item loosens the subject rule.
    stateAccepted: bs.reduce((s, x) => s + (x.accepted ?? 0), 0),
    stateRejected: count(bs, (r) => r !== 'ungrounded'),
    // M17-4: proposed, not sent (the record holds sent values only); `unchanged` must not rise.
    stateUngrounded: count(bs, (r) => r === 'ungrounded'),
    stateUnchanged: count(bs, (r) => r === 'unchanged'),
    // M18-2: a role ("the kobold") names its character, so these fall.
    stateWrongSubject: count(bs, (r) => r === 'wrong-subject'),
    // M13-5's bar: ≤ 200 with three present.
    maxStructured: Math.max(0, ...rows.map((r) => r.structured.tokens)),
    maxStructuredThreePresent: Math.max(0, ...rows.filter((r) => r.present.length >= 3).map((r) => r.structured.tokens)),
  };
}

/** Read B's part of a merged reply (M17-1), applied as `introduce` applies it; its time is read A's. */
export function mergedB(
  work: Adventure,
  subjects: Parameters<typeof applyChanges>[1],
  q: StateAsk,
  a: { text: string; parsed?: { changes?: unknown } | undefined },
): Reply {
  const changes = stateRead(q.who, q.max).shape.changes.safeParse(a.parsed?.changes).data ?? [];
  const r = applyChanges(work, subjects, changes, q.max);
  return { ms: 0, raw: a.text, parsed: a.parsed !== undefined, accepted: r.changed, rejected: r.rejected };
}
