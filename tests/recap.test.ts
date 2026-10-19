import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { setValue } from '@core/memory/looks';
import { recap, recapDue, RECAP_GAP_MS } from '@core/memory/recap';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Assertion, Entity } from '@core/model';

const HOUR = 3_600_000;
const act = (createdAt: number): Action => ({ id: `a${createdAt}`, type: 'continue', versions: ['x'], active: 0, createdAt });
const ent = (name: string, kind: Entity['kind']): Entity => ({ ...mergeEntity(undefined, { name, kind, description: '' }, 0), id: `ent_${name}` });
const event = (at: number, text: string): Assertion => ({
  id: `ev${at}`,
  subject: 'you',
  producer: 'batch',
  at,
  basis: 'stated',
  since: at,
  kind: 'event',
  text,
  who: ['you'],
});

describe('recap', () => {
  it('is due once the last action is 12 h old, never on an empty log', () => {
    expect(RECAP_GAP_MS).toBe(12 * HOUR);
    expect(recapDue([act(0)], 12 * HOUR)).toBe(true);
    expect(recapDue([act(0)], 11 * HOUR)).toBe(false);
    expect(recapDue([], 100 * HOUR)).toBe(false);
  });

  it('reads the summary tail, the newest two events, who is present and what you hold', () => {
    const korthak = ent('Korthak', 'character');
    const horn = ent('Horn', 'item');
    const key = ent('Key', 'item');
    const adv = createBlankAdventure('T', '');
    adv.entities = [korthak, horn, key];
    adv.plot = {
      ...adv.plot,
      storySummary: `Long ago: ${'a'.repeat(150)}.\n\nRecently: You reached the tower. Korthak waits.`,
      scene: { present: [korthak.id, 'Stranger'] },
    };
    adv.assertions = [
      event(1, 'You lit the lamp'),
      event(5, 'You met Korthak'),
      event(3, 'You found the horn'),
      ...setValue(horn, [], 'holder', 'you', 0),
      ...setValue(key, [], 'holder', 'Korthak', 0),
    ];
    expect(recap(adv)).toEqual({
      summary: 'You reached the tower. Korthak waits.',
      events: ['You found the horn', 'You met Korthak'],
      present: ['Korthak', 'Stranger'],
      held: ['Horn'],
    });
  });

  it('leaves the summary out when there is none', () => {
    expect(recap(createBlankAdventure('T', ''))).toEqual({ events: [], present: [], held: [] });
  });
});
