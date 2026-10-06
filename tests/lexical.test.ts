import { describe, expect, it } from 'vitest';
import { bm25, buildIndex, tokenise } from '@core/memory/lexical';

const corpus = [
  { id: 'common', text: 'The road runs to the river and the road runs back.' },
  { id: 'rare', text: 'Tamsin waits at the river crossing.' },
  { id: 'none', text: 'A quiet morning.' },
];

describe('bm25', () => {
  const index = buildIndex(corpus);

  it('ranks a document with a rare query term above one with only a common term', () => {
    expect(bm25(index, tokenise('Is Tamsin in the inn?'))).toEqual(['rare', 'common']);
  });

  it('scores nothing for a term in no document, and nothing for an empty query', () => {
    expect(bm25(index, tokenise('Morrow'))).toEqual([]);
    expect(bm25(index, [])).toEqual([]);
  });

  it('tokenises without punctuation or case', () => {
    expect(tokenise('"Tamsin!" said the Ferry-woman, at 3.')).toEqual(['tamsin', 'said', 'the', 'ferry', 'woman', 'at', '3']);
  });
});
