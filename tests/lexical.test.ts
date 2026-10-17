import { describe, expect, it } from 'vitest';
import { admitted, bm25, buildIndex, tokenise } from '@core/memory/lexical';

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

describe('admitted', () => {
  // Ten facts: "road" in six of them, every other word in one or two.
  const facts = buildIndex([
    { id: 'toll', text: 'takes a toll on the road' },
    { id: 'debt', text: 'owes the miller silver' },
    { id: 'r1', text: 'walks the road at dawn' },
    { id: 'r2', text: 'sings on the road' },
    { id: 'r3', text: 'fears the road at night' },
    { id: 'r4', text: 'mends the road' },
    { id: 'r5', text: 'sleeps by the road' },
    { id: 'm1', text: 'distrusts the miller' },
    { id: 'm2', text: 'once worked for the miller' },
    { id: 'none', text: 'hums old songs' },
  ]);
  const ask = (q: string) => [...admitted(facts, tokenise(q))].toSorted();

  it('two distinct content words hit: in', () => {
    expect(ask('Do you owe the miller silver?')).toEqual(['debt']);
  });

  it('one common word is not enough; one rare word is', () => {
    expect(ask('Tell me about the road.')).toEqual([]);
    expect(ask('Is there a toll?')).toEqual(['toll']);
  });

  it('stop words never count, and an empty query admits nothing', () => {
    expect(ask('the for and you')).toEqual([]);
    expect(ask('')).toEqual([]);
  });
});
