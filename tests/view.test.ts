import { describe, expect, it } from 'vitest';
import { composeSeePrompt } from '@core/image/compose';
import { viewOf } from '@core/image/view';
import type { Entity } from '@core/model';

type Char = Entity & { looks?: Record<string, string> };
const char = (id: string, name: string, description: string, looks?: Record<string, string>): Char => ({
  id,
  kind: 'character',
  name,
  aliases: [],
  description,
  ...(looks && { looks }),
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});
const bram = char('b', 'Bram', 'Bram is a toll keeper.');
const tamsin = char('t', 'Tamsin', 'Tamsin is a ferrywoman.');
const you = char('you', 'you', '', { species: 'human', hair: 'red' });
const see = (brief: string, entities: Char[]) => composeSeePrompt({ brief, entities, style: '', family: 'sdxl' });

describe('viewOf', () => {
  it('turns "to you" into a front view and takes it out of the brief', () => {
    expect(viewOf('soles exposed to you')).toEqual({ tags: ['looking at viewer, front view'], brief: 'soles exposed' });
    expect(viewOf('non-humanoid, paws with five digits and soles exposed to you').tags).toEqual(['looking at viewer, front view']);
  });

  it('reads behind, above and below', () => {
    expect(viewOf('the gate from behind')).toEqual({ tags: ['from behind'], brief: 'the gate' });
    expect(viewOf('looking down at her').tags).toEqual(['from above']);
    expect(viewOf('the tower, looking up at it').tags).toEqual(['from below']);
  });

  it('drops you, your and yourself as whole words, keeps "young"', () => {
    expect(viewOf('a young scribe hands you your quill, yourself unseen')).toEqual({ tags: [], brief: 'a young scribe hands quill, unseen' });
  });

  it('no viewpoint word leaves the brief byte-identical', () => {
    const brief = '  the ferry at dusk,  low mist ';
    expect(viewOf(brief)).toEqual({ tags: [], brief });
  });
});

describe('composeSeePrompt views', () => {
  it('puts view tags before the brief', () => {
    expect(see('Bram, soles exposed to you', [bram]).blocks.story).toBe('looking at viewer, front view, a toll keeper, soles exposed');
  });

  it('adds the player as pov with their looks only when the brief says you and they have looks', () => {
    const said = see('Bram glares at you', [bram, tamsin, you]);
    expect(said.entityIds).toEqual(['b', 'you']);
    expect(said.blocks.subject).toBe('duo, a toll keeper, pov, human, red hair');
    expect(see('Bram glares', [bram, you]).entityIds).toEqual(['b']);
    expect(see('Bram glares at you', [bram, { ...you, looks: {} }]).entityIds).toEqual(['b']);
  });
});
