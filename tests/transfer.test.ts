import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ZipReader } from '@adapters/storage/zip';
import { exportAdventureJson, importAdventureJson, importAidZip, importStoryCardsJson, mapAidJson } from '@adapters/storage/transfer';
import { createBlankAdventure } from '@core/model/scenario';

/** Build a zip in memory (stored or deflated entries) — enough to test the reader. */
function makeZip(files: { name: string; data: string; deflate?: boolean }[]): ArrayBuffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (b: Uint8Array) => {
    let c = -1;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  for (const f of files) {
    const raw = enc.encode(f.data);
    const body = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = enc.encode(f.name);
    const method = f.deflate ? 8 : 0;
    const crc = crc32(raw);
    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(body.length),
      ...u32(raw.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...body,
    ]);
    const central = new Uint8Array([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(body.length),
      ...u32(raw.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(cdSize),
    ...u32(offset),
    ...u16(0),
  ]);
  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of [...locals, ...centrals, eocd]) {
    out.set(b, p);
    p += b.length;
  }
  return out.buffer;
}

describe('ZipReader', () => {
  it('lists entries and reads stored and deflated files', async () => {
    const zip = new ZipReader(
      makeZip([
        { name: 'a.txt', data: 'hello' },
        { name: 'dir/b.json', data: JSON.stringify({ x: 1 }), deflate: true },
      ]),
    );
    expect(zip.entries.map((e) => e.name)).toEqual(['a.txt', 'dir/b.json']);
    expect(await zip.readText(zip.entries[0]!)).toBe('hello');
    expect(JSON.parse(await zip.readText(zip.entries[1]!))).toEqual({ x: 1 });
  });
  it('rejects non-zip data', () => {
    expect(() => new ZipReader(new Uint8Array(40).buffer)).toThrow(/zip/i);
  });
});

describe('adventure transfer', () => {
  it('round-trips our own JSON export with fresh ids', () => {
    const a = createBlankAdventure('T', 'You wake.');
    const json = exportAdventureJson(a);
    const b = importAdventureJson(json);
    expect(b.title).toBe('T');
    expect(b.actions[0]!.versions[0]).toBe('You wake.');
    expect(b.id).not.toBe(a.id);
    expect(b.actions[0]!.id).not.toBe(a.actions[0]!.id);
  });

  it('maps an AI Dungeon-style JSON adventure', () => {
    const aid = {
      title: 'Salt Road',
      description: 'desc',
      memory: 'Water is currency.',
      authorsNote: 'terse',
      actions: [
        { text: 'You are on the Salt Road.', type: 'story' },
        { text: '> You look around.', type: 'do' },
        { text: 'Dunes.', type: 'continue' },
      ],
      storyCards: [{ keys: 'merav,rider', entry: 'Merav leads the caravan.', type: 'Character', title: 'Merav' }],
    };
    const adv = mapAidJson(aid)!;
    expect(adv.title).toBe('Salt Road');
    expect(adv.actions.map((x) => x.type)).toEqual(['start', 'do', 'continue']);
    expect(adv.plot.plotEssentials).toBe('Water is currency.');
    expect(adv.storyCards[0]!.triggers).toEqual(['merav', 'rider']);
    expect(adv.storyCards[0]!.name).toBe('Merav');
  });

  it('imports an AID-style zip and falls back to text exports', async () => {
    const withJson = makeZip([
      { name: 'adventure.json', data: JSON.stringify({ title: 'Z', actions: [{ text: 'Start.' }, { text: '> You go.', type: 'do' }] }), deflate: true },
    ]);
    const a = await importAidZip(withJson);
    expect(a.title).toBe('Z');
    expect(a.actions).toHaveLength(2);
    const textOnly = makeZip([{ name: 'My Story.txt', data: 'Opening paragraph.\n\n> You wave.\n\nShe waves back.' }]);
    const b = await importAidZip(textOnly);
    expect(b.title).toBe('My Story');
    expect(b.actions.map((x) => x.type)).toEqual(['start', 'do', 'continue']);
  });

  it('imports AID story card arrays', () => {
    const cards = importStoryCardsJson(JSON.stringify([{ keys: 'a,b', entry: 'E', type: 'Location', title: 'N' }]));
    expect(cards[0]).toMatchObject({ triggers: ['a', 'b'], entry: 'E', type: 'Location', name: 'N' });
  });
});
