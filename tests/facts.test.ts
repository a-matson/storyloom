import { describe, expect, it } from 'vitest';
import { rankFacts } from '@core/memory/facts';
import type { Entity, EntityFact } from '@core/model/types';

const fact = (id: string, fromAction: number, over: Partial<EntityFact> = {}): EntityFact => ({ id, text: id, fromAction, source: 'memory', ...over });
const entity = (id: string, facts: EntityFact[]): Entity => ({
  id,
  kind: 'character',
  name: id,
  aliases: [],
  description: '',
  facts,
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});

describe('rankFacts', () => {
  const lena = entity('lena', [fact('lena-old', 1), fact('lena-new', 5)]);
  const orrin = entity('orrin', [fact('orrin-new', 9), fact('orrin-pinned', 0, { pinned: true })]);
  const absent = entity('absent', [fact('absent', 9), fact('absent-pinned', 2, { pinned: true }), fact('absent-conflict', 3, { conflict: true })]);
  const ids = (present: string[], mentioned: string[]) => rankFacts([absent, orrin, lena], new Set(present), new Set(mentioned)).map((r) => r.fact.id);

  it('ranks pinned and conflicted, then present, then mentioned facts, newest first, and leaves the rest out', () => {
    expect(ids(['lena'], ['orrin'])).toEqual(['absent-conflict', 'absent-pinned', 'orrin-pinned', 'lena-new', 'lena-old', 'orrin-new']);
  });

  it('puts lexical hits first within each tier, never above a pinned or present fact', () => {
    const ranked = rankFacts([absent, orrin, lena], new Set(['lena']), new Set(['orrin']), ['mem_x', 'orrin-new', 'lena-old', 'absent']);
    expect(ranked.map((r) => r.fact.id)).toEqual(['absent-conflict', 'absent-pinned', 'orrin-pinned', 'lena-old', 'lena-new', 'orrin-new']);
  });

  it('keeps a conflicted fact as worded, flag intact', () => {
    const ranked = rankFacts([absent], new Set(['absent']), new Set());
    expect(ranked.find((r) => r.fact.id === 'absent-conflict')?.fact.conflict).toBe(true);
  });
});
