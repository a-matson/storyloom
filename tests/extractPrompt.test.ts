import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { newNamesIn } from '@core/memory/fold';
import { createBlankAdventure } from '@core/model/scenario';
import { extractPrompt } from '@core/text/prompts';

describe('the entity call’s prompt', () => {
  it('shows a worked example only when no grammar carries the shape', () => {
    expect(extractPrompt('[0] Mira waves.', [], true)).not.toMatch(/<Name>|Ysolde/);
    expect(extractPrompt('[0] Mira waves.', [], false)).toMatch(/"looks": \{"<key>": "<a few words>"\}/);
    expect(extractPrompt('[0] Mira waves.', [], false)).not.toMatch(/Ysolde|Brass Owl|timeDelta|cards|New here/);
  });
});

describe('newNamesIn', () => {
  it('leaves out a part of a longer new name or of a known one, and keeps a possessive inside a name', () => {
    const adv = createBlankAdventure('T', '');
    adv.actions = [
      {
        id: 'a0',
        type: 'continue',
        versions: ["You wave and Mira waves back; Old Brannoch nods, Brannoch smiles, the Ashen Order rides to Deadman's Gulch, and Mira's dog barks."],
        active: 0,
        createdAt: 0,
      },
    ];
    adv.entities = [mergeEntity(undefined, { name: 'The Ashen Order', kind: 'faction', description: '', facts: [] }, 0)];
    expect(newNamesIn(adv, { fromAction: 0, toAction: 1 })).toEqual(['Mira', 'Old Brannoch', "Deadman's Gulch"]);
  });
});
