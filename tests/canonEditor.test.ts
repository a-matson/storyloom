import { describe, expect, it } from 'vitest';
import { entityEdits } from '@app/session/entities';
import { createBlankAdventure, type Entity } from '@core/model';
import { setup } from './fixtures/session';

const mira: Entity = { id: 'ent_mira', kind: 'character', name: 'Mira', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 };

function start() {
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = [mira];
  return setup({ adventure });
}

describe('canon editor writes', () => {
  it('setVoice ends the current voice and writes the player one', () => {
    const { session } = start();
    const edits = entityEdits(session);
    edits.setVoice(mira.id, 'Clipped, formal.');
    edits.setVoice(mira.id, 'Warm, slow.');
    const voices = session.getSnapshot().adventure.assertions.filter((a) => a.kind === 'voice');
    expect(voices.map((a) => [a.text, a.basis, a.until])).toEqual([
      ['Clipped, formal.', 'player', 1],
      ['Warm, slow.', 'player', undefined],
    ]);
  });

  it('addCharacter adds a character with no card and no lines', () => {
    const { session } = start();
    entityEdits(session).addCharacter('Tamsin');
    const adv = session.getSnapshot().adventure;
    const t = adv.entities.find((e) => e.name === 'Tamsin');
    expect(t).toMatchObject({ kind: 'character', firstSeen: 1, lastSeen: 1 });
    expect(t?.cardId).toBeUndefined();
    expect(adv.assertions.filter((a) => a.subject === t?.id)).toEqual([]);
  });
});
