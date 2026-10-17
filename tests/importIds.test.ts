import { expect, it } from 'vitest';
import { exportAdventureJson, importAdventureJson } from '@adapters/transfer';
import { createBlankAdventure } from '@core/model';

it('repoints the scene, scene log and presence to the new entity ids', () => {
  const a = createBlankAdventure('T', 'You wake.');
  const base = { kind: 'character' as const, aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 };
  a.entities = [
    { ...base, id: 'ent_1', name: 'Lena' },
    { ...base, id: 'ent_2', name: 'Quay', kind: 'place' },
  ];
  a.plot.scene = { location: 'ent_2', present: ['ent_1', 'a stranger'], zones: { ent_1: 'the hold' } };
  a.plot.sceneLog = [{ at: 1, location: 'ent_2' }];
  a.plot.presence = [{ at: 1, present: ['ent_1'] }];
  const { adventure: b } = importAdventureJson(exportAdventureJson(a));
  const [lena, quay] = b.entities;
  expect(b.plot.scene).toEqual({ location: quay?.id, present: [lena?.id, 'a stranger'], zones: { [lena?.id ?? '']: 'the hold' } });
  expect(b.plot.sceneLog).toEqual([{ at: 1, location: quay?.id }]);
  expect(b.plot.presence).toEqual([{ at: 1, present: [lena?.id] }]);
});
