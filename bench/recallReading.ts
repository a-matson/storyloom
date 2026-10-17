/**
 * One replay depth's reading for the long record (M17-0): what the bank, the summary and retrieval
 * do at 300 actions. Pure, so the triggers for M19-2/3/4 are tested, not eyeballed.
 */
import { cosine } from '@core/memory/memoryBank';
import type { Memory } from '@core/model';
import { retrievalHit, type SeededFact, type Verdict } from './recall';

/** Two retrieved memories this close say the same thing twice. [provisional] */
export const DUPLICATE_COSINE = 0.9;
/** The sections `selectStructured` writes. */
const STRUCTURED = ['rules', 'scene', 'cast'];

export type BankMemory = Pick<Memory, 'id' | 'text' | 'forgotten' | 'stale' | 'embedding'>;
export interface ProbeRow {
  id: string;
  verdict: Verdict;
  retrieved: boolean;
  memoryIds: string[];
  sections: Record<string, number>;
}

/** Facts played in story turns 1-5; `record()` plays a filler after every fourth plant. */
export const earlyFacts = (facts: SeededFact[]): Set<string> =>
  new Set(
    facts
      .filter((f) => f.plant[0] === 'Do' || f.plant[0] === 'Say')
      .filter((_, i) => i + Math.floor(i / 4) + 1 <= 5)
      .map((f) => f.id),
  );

/** Pairs among one probe's retrieved memories closer than `DUPLICATE_COSINE`. */
function duplicatePairs(ids: string[], byId: Map<string, BankMemory>): number {
  const vs = ids.flatMap((id) => {
    const e = byId.get(id)?.embedding;
    return e ? [e] : [];
  });
  let n = 0;
  for (const [i, a] of vs.entries()) for (const b of vs.slice(i + 1)) if (a.length === b.length && cosine(a, b) > DUPLICATE_COSINE) n++;
  return n;
}

export function readDepth(memories: BankMemory[], probes: ProbeRow[], facts: SeededFact[], summaryMoves: number) {
  const byId = new Map(memories.map((m) => [m.id, m]));
  const active = memories.filter((m) => !m.forgotten && !m.stale);
  const forgotten = memories.filter((m) => m.forgotten);
  const early = earlyFacts(facts);
  const retrieved = probes.filter((p) => p.retrieved);
  const structured = probes.map((p) => STRUCTURED.reduce((n, k) => n + (p.sections[k] ?? 0), 0));
  return {
    bank: active.length,
    forgotten: forgotten.length,
    summaryMoves,
    duplicates: probes.reduce((n, p) => n + duplicatePairs(p.memoryIds, byId), 0),
    earlyHonoured: probes.filter((p) => early.has(p.id) && p.verdict === 'honoured').length,
    early: early.size,
    // A canon fact the bank held once and now holds only in forgotten memories.
    canonEvicted: facts
      .filter((f) => f.class === 'canon')
      .filter((f) => forgotten.some((m) => retrievalHit(m.text, f)) && !active.some((m) => retrievalHit(m.text, f)))
      .map((f) => f.id),
    honouredPerRetrieved: retrieved.length ? retrieved.filter((p) => p.verdict === 'honoured').length / retrieved.length : 0,
    structuredMax: Math.max(0, ...structured),
    structuredMean: structured.length ? structured.reduce((a, b) => a + b, 0) / structured.length : 0,
  };
}
