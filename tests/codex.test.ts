import { describe, expect, it } from 'vitest';
import { codexMarkdown, compileCodex, filterCodex } from '@core/memory/codex';
import { mergeEntity } from '@core/memory/entities';
import type { Adventure, Assertion } from '@core/model';
import { memoryAdventure } from './fixtures/memoryJobs';

const mira = mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0);
const bram = mergeEntity(undefined, { name: 'Bram', kind: 'character', description: '' }, 0);
const inn = mergeEntity(undefined, { name: 'Red Inn', kind: 'place', description: '' }, 0);
const cellar = { ...mergeEntity(undefined, { name: 'Cellar', kind: 'place', description: '' }, 0), partOf: inn.id };
const base = { producer: 'batch', basis: 'stated' } as const;
const event: Assertion = { ...base, id: 'ev', subject: mira.id, at: 4, since: 4, kind: 'event', text: 'Mira hands Bram the ledger', who: [mira.id, bram.id] };
const look: Assertion = { ...base, id: 'l', subject: mira.id, at: 1, since: 1, kind: 'look', key: 'eyes', value: 'green' };

function setup(): Adventure {
  const adv = memoryAdventure(9);
  adv.entities = [mira, bram, inn, cellar];
  adv.assertions = [event, look];
  adv.rules = [{ id: 'r', text: 'Kobolds fear fire', gates: [], source: 'player', status: 'confirmed', createdAt: 0, fromAction: 0 }];
  adv.plot.sceneLog = [
    { at: 2, location: 'Red Inn' },
    { at: 6, location: 'the docks' },
  ];
  adv.plot.presence = [
    { at: 0, present: [] },
    { at: 3, present: [bram.id] },
  ];
  return adv;
}

describe('codex (M27-1)', () => {
  it('lists each character with their events, rooms under places, and a timeline by action', () => {
    const c = compileCodex(setup());
    for (const name of ['Mira', 'Bram']) expect(c.characters.find((e) => e.title === name)?.lines).toContainEqual({ text: event.text, at: 4 });
    expect(c.characters.find((e) => e.title === 'Mira')?.lines).toContainEqual({ text: 'Looks: eyes: green' });
    const innEntry = c.places.find((e) => e.title === 'Red Inn');
    expect(innEntry?.lines).toContainEqual({ text: 'Rooms: Cellar' });
    expect(innEntry?.lines).toContainEqual({ text: 'Been here: Bram' });
    expect(c.rules).toEqual([{ text: 'Kobolds fear fire', at: 0 }]);
    expect(c.timeline.map((l) => l.at)).toEqual([2, 4, 6]);
  });

  it('a search keeps only matching lines', () => {
    const c = filterCodex(compileCodex(setup()), 'LEDGER');
    expect(c.characters.map((e) => e.lines)).toEqual([[{ text: event.text, at: 4 }], [{ text: event.text, at: 4 }]]);
    expect(c.places).toEqual([]);
    expect(c.rules).toEqual([]);
    expect(c.timeline).toEqual([{ text: event.text, at: 4 }]);
  });

  it('exports one heading per section and a bullet per event', () => {
    const md = codexMarkdown(compileCodex(setup()));
    expect(md.match(/^## Characters$/gm)).toHaveLength(1);
    expect(md.match(/^- \(4\) Mira hands Bram the ledger$/gm)).toHaveLength(3);
  });
});
