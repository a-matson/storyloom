import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportAdventureJson, exportAdventureText, exportStoryCardsJson, importAdventureJson, importAidZip, importStoryCardsJson } from '@adapters/transfer';
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

  it('refuses a zip that expands past the size cap', () => {
    const bomb = zipSync({ 'a.txt': new Uint8Array(65 * 1024 * 1024) }, { level: 9 }).buffer;
    expect(bomb.byteLength).toBeLessThan(200_000);
    expect(() => importAidZip(bomb, settings)).toThrow(/refusing to import/);
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
