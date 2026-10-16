import { describe, expect, it } from 'vitest';
import { articleOnly, kindOf } from '@core/memory/kindCues';

describe('kindOf', () => {
  it('re-kinds a faction reply the passage cues as a place', () => {
    expect(kindOf('East End', 'faction', ['They run things in the East End now.'])).toBe('place');
    expect(kindOf('London', 'faction', ['the rooftops of London, all part of London.'])).toBe('place');
  });

  it('keeps a reply two classes match', () => {
    const texts = ['the Harrow men sit by the door.', 'Word went to the Harrow crew.', 'He rode to Harrow last night.'];
    expect(kindOf('Harrow', 'faction', texts)).toBe('faction');
    expect(kindOf('Harrow', 'place', texts)).toBe('place');
  });

  it('never re-kinds a character or an item', () => {
    expect(kindOf('Minos', 'character', ['You talk to Minos in the kitchen.', 'You walk to Minos.'])).toBe('character');
    expect(kindOf('Lantern', 'item', ['You walk into Lantern.'])).toBe('item');
  });

  it('gives an item to a place reply the passage picks up', () => {
    expect(kindOf('Amulet', 'place', ['She picks up the Amulet and turns it over.'])).toBe('item');
  });
});

describe('articleOnly', () => {
  it('is true only when every mid-sentence sighting follows "the"', () => {
    expect(articleOnly('Formica', ['across the Formica tabletop', 'against the Formica'])).toBe(true);
    expect(articleOnly('Formica', ['across the Formica', 'Then Formica smiles.', 'ask Formica'])).toBe(false);
    expect(articleOnly('Formica', ['Formica. Nothing else.'])).toBe(false);
  });
});
