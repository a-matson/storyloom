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

  it('makes a named creature a character whatever the reply says', () => {
    expect(kindOf('Goldarok', 'faction', ['You face the powerful ancient dragon Goldarok in his lair.'])).toBe('character');
    expect(kindOf('Goldarok', 'place', ['Goldarok, the old red dragon, stirs.'])).toBe('character');
    expect(kindOf('Mab', 'item', ['Queen Mab smiles.'])).toBe('character');
  });

  it('keeps faction and place cues without a creature word by the name', () => {
    expect(kindOf('Ashen Order', 'faction', ["the Ashen Order's men wait. The Ashen Order are many."])).toBe('faction');
    expect(kindOf('Halven', 'faction', ['the man of Halven walks on.', 'You live in Halven.'])).toBe('place');
    expect(kindOf('Halven', 'faction', ["Halven, the dragon's town, burns."])).toBe('faction');
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
