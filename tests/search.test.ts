import { describe, expect, it } from 'vitest';
import type { Action, Adventure, Assertion, Memory } from '@core/model';
import { searchDocs, searchStory, snippet, SNIPPET_CHARS } from '@core/memory/search';
import { makeAdventure } from './fixtures/adventure';

const act = (id: string, text: string, type: Action['type'] = 'continue'): Action => ({ id, type, versions: [text], active: 0, createdAt: 0 });
const memory: Memory = { id: 'm1', text: 'Tamsin sold the compass in Saltreach.', fromAction: 0, toAction: 2, actionIds: [], useCount: 0, createdAt: 0 };
const event: Assertion = {
  id: 'e1',
  kind: 'event',
  text: 'The bell tower fell.',
  who: ['you'],
  subject: 'you',
  producer: 'batch',
  at: 2,
  paragraph: 1,
  basis: 'stated',
  since: 2,
};
const adv: Pick<Adventure, 'actions' | 'memories' | 'assertions'> = {
  actions: [
    act('a0', 'The road is long.\n\nA lantern swings over the gate.'),
    act('a1', '> You look at the lantern.', 'do'),
    act('a2', 'Rain.\n\nThe bell rings once.'),
    act('a3', 'A lantern, painted gold.', 'see'),
  ],
  memories: [memory, { ...memory, id: 'm2', text: '', skipped: true }],
  assertions: [event],
};
const docs = searchDocs(adv);

describe('story search', () => {
  it('finds a paragraph, a memory and an event, each with its place', () => {
    expect(searchStory(docs, 'gate')).toEqual([expect.objectContaining({ kind: 'action', at: 0, paragraph: 1 })]);
    expect(searchStory(docs, 'compass')).toEqual([expect.objectContaining({ kind: 'memory', id: 'm1', at: 0 })]);
    expect(searchStory(docs, 'tower')).toEqual([expect.objectContaining({ kind: 'event', at: 2, paragraph: 1 })]);
  });

  it('ranks a rarer word higher', () => {
    expect(searchStory(docs, 'lantern bell').map((d) => d.id)[0]).toBe('a2:1');
  });

  it('finds nothing for an empty query, a See or a skipped memory', () => {
    expect(searchStory(docs, '  ')).toEqual([]);
    expect(searchStory(docs, 'painted')).toEqual([]);
    expect(docs.some((d) => d.id === 'm2')).toBe(false);
  });

  it('cuts a long text around the first hit', () => {
    const text = `${'word '.repeat(60)}Tamsin ${'word '.repeat(60)}`;
    const s = snippet(text, 'tamsin');
    expect(s).toContain('Tamsin');
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(SNIPPET_CHARS + 2);
    expect(snippet('Short.', 'x')).toBe('Short.');
  });

  // [measured: tests/search.test.ts] the M28-4 bar, on the fixture rather than the M17 export.
  it('searches a 600-action story in under 100 ms', () => {
    const big = searchDocs(makeAdventure({ actions: 600, memories: 100, embeddingDim: 1 }));
    const t = performance.now();
    searchStory(big, 'lantern caravan');
    expect(performance.now() - t).toBeLessThan(100);
  });
});
