import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  exportAdventureJson,
  exportAdventureText,
  exportStoryCardsJson,
  exportTracesJsonl,
  importAdventureJson,
  importAidZip,
  importStoryCardsJson,
} from '@adapters/transfer';
import { makeTrace } from './fixtures/trace';
import { migrateEntities } from '@core/memory/assertions';
import { createBlankAdventure, DEFAULT_ADVENTURE_SETTINGS } from '@core/model';

const zip = (files: Record<string, string>, level: 0 | 6 = 6): ArrayBuffer =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level }).buffer;
const settings = DEFAULT_ADVENTURE_SETTINGS;

describe('adventure JSON', () => {
  it('round-trips our own export with fresh ids', () => {
    const a = createBlankAdventure('T', 'You wake.');
    const { adventure: b, warnings } = importAdventureJson(exportAdventureJson(a));
    expect(b.title).toBe('T');
    expect(b.actions[0]!.versions[0]).toBe('You wake.');
    expect(b.id).not.toBe(a.id);
    expect(b.actions[0]!.id).not.toBe(a.actions[0]!.id);
    expect(warnings).toEqual([]);
  });

  it('drops image ids an export cannot carry blobs for', () => {
    const a = createBlankAdventure('T', 'You wake.');
    a.coverId = 'img_cover';
    a.actions.push({ id: 'act_see', type: 'see', versions: [''], active: 0, createdAt: 1, image: { imageId: 'img_1', prompt: 'a door' } });
    a.entities = [
      {
        id: 'ent_1',
        kind: 'character',
        name: 'Lena',
        aliases: [],
        description: '',
        relations: [],
        firstSeen: 0,
        lastSeen: 0,
        portraitId: 'img_face',
        referenceImageId: 'img_1',
        look: 'a ferrywoman, grey braid',
      },
    ];
    const { adventure: b } = importAdventureJson(exportAdventureJson(a));
    expect(b.coverId).toBeUndefined();
    expect(b.entities[0]).not.toHaveProperty('portraitId');
    expect(b.entities[0]).not.toHaveProperty('referenceImageId');
    expect(b.entities[0]?.look).toBe('a ferrywoman, grey braid');
    expect(b.actions[1]!.image).toEqual({ prompt: 'a door', missing: true });
  });

  it('gives entities fresh ids and repoints their relations and promoted cards', () => {
    const a = createBlankAdventure('T', 'You wake.');
    a.storyCards = [{ id: 'card_1', type: 'character', name: 'Lena', entry: 'Lena.', triggers: ['Lena'] }];
    const base = { kind: 'character' as const, aliases: [], description: '', facts: [], state: {}, firstSeen: 0, lastSeen: 0 };
    a.entities = [
      { ...base, id: 'ent_1', name: 'Lena', relations: [{ to: 'ent_2', label: 'sister' }], cardId: 'card_1' },
      { ...base, id: 'ent_2', name: 'Mira', relations: [{ to: 'ent_gone', label: 'owes' }] },
    ];
    const { adventure: b } = importAdventureJson(exportAdventureJson(a));
    const [lena, mira] = b.entities;
    expect(b.entities.map((e) => e.name)).toEqual(['Lena', 'Mira']);
    expect(lena?.id).not.toBe('ent_1');
    expect(lena?.id).toMatch(/^ent_/);
    expect(lena?.relations).toEqual([{ to: mira?.id, label: 'sister' }]);
    expect(lena?.cardId).toBe(b.storyCards[0]?.id);
    expect(mira?.relations).toEqual([{ to: 'ent_gone', label: 'owes' }]);
    expect(mira).not.toHaveProperty('cardId');
  });

  it('keeps assertions and repoints their subjects and effect causes', () => {
    const a = createBlankAdventure('T', 'You wake.');
    const base = { kind: 'character' as const, aliases: [], description: '', facts: [], state: {}, relations: [], firstSeen: 0, lastSeen: 0 };
    a.entities = [
      { ...base, id: 'ent_1', name: 'Lena' },
      { ...base, id: 'ent_2', name: 'Mira' },
    ];
    const cause = { kind: 'character' as const, id: 'ent_1', text: 'Lena' };
    a.assertions = [{ id: 'as_1', subject: 'ent_2', producer: 'player', at: 0, basis: 'player', since: 0, kind: 'effect', condition: 'cursed', cause }];
    const { adventure: b } = importAdventureJson(exportAdventureJson(a));
    const [lena, mira] = b.entities;
    expect(b.assertions).toEqual([{ ...a.assertions[0], subject: mira?.id, cause: { ...cause, id: lena?.id } }]);
  });

  it('exports version 2 and keeps rules with their gates repointed', () => {
    const a = createBlankAdventure('T', 'You wake.');
    a.entities = [{ kind: 'character', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0, id: 'ent_1', name: 'Lena' }];
    a.rules = [{ id: 'rule_1', text: 'Lena never lies', gates: ['ent_1', 'ent_gone'], source: 'player', status: 'confirmed', createdAt: 1, fromAction: 0 }];
    const json = exportAdventureJson(a);
    expect(JSON.parse(json)).toMatchObject({ version: 2 });
    const { adventure: b } = importAdventureJson(json);
    expect(b.rules).toEqual([{ ...a.rules[0], gates: [b.entities[0]?.id, 'ent_gone'] }]);
  });

  it('keeps a version 1 export’s entity facts for the first open, sources and causes repointed', () => {
    const a = createBlankAdventure('T', 'You wake.');
    const base = { kind: 'character', aliases: [], relations: [], firstSeen: 0, lastSeen: 0 };
    const said = a.actions[0]?.id;
    const hex = {
      id: 'f1',
      text: 'cursed',
      fromAction: 0,
      source: 'memory',
      kind: 'effect',
      sourceId: said,
      evidence: 'You wake',
      cause: { kind: 'character', id: 'ent_1', text: 'Lena' },
    };
    const entities = [
      { ...base, id: 'ent_1', name: 'Lena', description: 'A ferrywoman.', facts: [], state: { mood: 'calm' } },
      { ...base, id: 'ent_2', name: 'Mira', description: '', facts: [hex], state: {} },
    ];
    const { adventure: b } = importAdventureJson(JSON.stringify({ format: 'storyloom-adventure', version: 1, adventure: { ...a, entities } }));
    const [lena, mira] = b.entities;
    // What the storage open then does.
    const moved = migrateEntities(b.entities, b.actions, b.assertions);
    expect(moved.entities.map((e) => e.description)).toEqual(['', '']);
    expect(moved.assertions.map((x) => [x.subject, x.kind])).toEqual([
      [lena?.id, 'identity'],
      [lena?.id, 'state'],
      [mira?.id, 'effect'],
    ]);
    expect(moved.assertions.at(-1)).toMatchObject({ at: 0, span: 'You wake', condition: 'cursed', cause: { kind: 'character', id: lena?.id, text: 'Lena' } });
  });

  it('parses an export from before rules with none', () => {
    const { rules: _rules, ...old } = createBlankAdventure('T', 'You wake.');
    expect(importAdventureJson(JSON.stringify({ format: 'storyloom-adventure', version: 1, adventure: old })).adventure.rules).toEqual([]);
  });

  it('repoints the characters a See image is tagged with', () => {
    const a = createBlankAdventure('T', 'You wake.');
    const base = { kind: 'character' as const, aliases: [], description: '', facts: [], state: {}, relations: [], firstSeen: 0, lastSeen: 0 };
    a.entities = [{ ...base, id: 'ent_1', name: 'Lena' }];
    a.actions.push({
      id: 'act_see',
      type: 'see',
      versions: [''],
      active: 0,
      createdAt: 1,
      image: { prompt: 'a woman', brief: 'Lena', entityIds: ['ent_1', 'ent_gone'] },
    });
    const { adventure: b } = importAdventureJson(exportAdventureJson(a));
    expect(b.actions.at(-1)?.image?.entityIds).toEqual([b.entities[0]?.id, 'ent_gone']);
    expect(b.actions.at(-1)?.image?.brief).toBe('Lena');
  });

  it('names the broken field of a damaged export', () => {
    const json = JSON.parse(exportAdventureJson(createBlankAdventure('T', 'x'))) as { adventure: { actions: unknown[] } };
    json.adventure.actions = [{ id: 'a', type: 'jump', versions: [], active: 0, createdAt: 0 }];
    expect(() => importAdventureJson(JSON.stringify(json))).toThrow(/adventure\.actions\.0\.type/);
  });

  it('maps an AI Dungeon adventure, skipping bad cards and actions with warnings', () => {
    const aid = {
      title: 'Salt Road',
      memory: 'Water is currency.',
      actions: [{ text: 'You are on the Salt Road.', type: 'story' }, { text: '> You look around.', type: 'do' }, { type: 'do' }, { text: 'Dunes.' }],
      storyCards: [
        { keys: 'merav,rider', entry: 'Merav leads the caravan.', type: 'Character', title: 'Merav' },
        { keys: 42, entry: 'bad keys' },
      ],
    };
    const { adventure, warnings } = importAdventureJson(JSON.stringify(aid));
    expect(adventure.actions.map((x) => x.type)).toEqual(['start', 'do', 'continue']);
    expect(adventure.plot.plotEssentials).toBe('Water is currency.');
    expect(adventure.storyCards).toHaveLength(1);
    expect(adventure.storyCards[0]).toMatchObject({ name: 'Merav', triggers: ['merav', 'rider'] });
    expect(warnings).toEqual(['Skipped action 3: unexpected shape.', 'Skipped story card 2: unexpected shape.']);
  });

  it('rejects JSON that is no adventure', () => {
    expect(() => importAdventureJson('{"hello":1}')).toThrow(/Unrecognised/);
  });
});

describe('zip import', () => {
  it('reads an adventure JSON, wrapped or not, and reports unreadable files', () => {
    const z = zip({ 'notes.json': '{oops', 'export/adventure.json': JSON.stringify({ adventure: { title: 'Z', actions: [{ text: 'Start.' }] } }) });
    const { adventure, warnings } = importAidZip(z, settings);
    expect(adventure.title).toBe('Z');
    expect(warnings).toEqual(['Skipped notes.json: not valid JSON.']);
  });

  it('falls back to a text transcript', () => {
    const { adventure } = importAidZip(zip({ 'My Story.txt': 'Opening.\n\n> You wave.\n\nShe waves back.' }, 0), settings);
    expect(adventure.title).toBe('My Story');
    expect(adventure.actions.map((x) => x.type)).toEqual(['start', 'do', 'continue']);
  });

  it('refuses a zip that claims to expand past the size cap', () => {
    // A tiny zip whose headers declare 65 MB: tests the cap without building a real 65 MB file.
    const bytes = new Uint8Array(zip({ 'a.txt': 'x' }));
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 4; i++) {
      if (view.getUint32(i, true) === 0x04034b50) view.setUint32(i + 22, 65 * 1024 * 1024, true); // local header
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 65 * 1024 * 1024, true); // central directory
    }
    expect(() => importAidZip(bytes.buffer, settings)).toThrow(/refusing to import/);
  });

  it('rejects truncated or non-zip data', () => {
    const z = zip({ 'a.txt': 'hello world' });
    expect(() => importAidZip(z.slice(0, 20), settings)).toThrow(/invalid zip data/);
    expect(() => importAidZip(new Uint8Array(40).buffer, settings)).toThrow(/invalid zip data/);
  });
});

describe('story cards', () => {
  it('imports AID card arrays and reports bad entries', () => {
    const { cards, warnings } = importStoryCardsJson(JSON.stringify([{ keys: 'a,b', entry: 'E', type: 'Location', title: 'N' }, 'nope']));
    expect(cards[0]).toMatchObject({ triggers: ['a', 'b'], entry: 'E', type: 'Location', name: 'N' });
    expect(warnings).toHaveLength(1);
  });

  it('round-trip through the AID card format', () => {
    const cards = [{ id: 'c1', type: 'Character', name: 'Merav', entry: 'Leads the caravan.', triggers: ['merav', 'rider'], notes: 'Blind.' }];
    const { cards: back } = importStoryCardsJson(exportStoryCardsJson(cards));
    expect(back[0]).toMatchObject({ type: 'Character', name: 'Merav', entry: 'Leads the caravan.', triggers: ['merav', 'rider'] });
  });
});

describe('text export', () => {
  it('joins the active versions and leaves out image actions', () => {
    const a = createBlankAdventure('T', 'Opening.');
    a.actions.push(
      { id: 'x', type: 'see', versions: ['[image]'], active: 0, createdAt: 0 },
      { id: 'y', type: 'continue', versions: ['old', 'new'], active: 1, createdAt: 0 },
    );
    expect(exportAdventureText(a)).toBe('Opening.\n\nnew');
  });
});

describe('traces JSONL', () => {
  it('writes one trace per line, oldest first, with the prompt', () => {
    const out = exportTracesJsonl([makeTrace({ turnId: 'b', createdAt: 2 }), makeTrace({ turnId: 'a', createdAt: 1, prompt: 'hello' })]);
    const rows = out
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(rows.map((r) => r.turnId)).toEqual(['a', 'b']);
    expect(rows[0].prompt).toBe('hello');
    expect(out.endsWith('\n')).toBe(true);
    expect(exportTracesJsonl([])).toBe('');
  });
});
