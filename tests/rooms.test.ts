import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { notePlace } from '@core/memory/introduce';
import { fileRooms, roomOf } from '@core/memory/rooms';
import { createBlankAdventure } from '@core/model/scenario';
import type { Entity } from '@core/model';

const place = (name: string, partOf?: string): Entity => ({
  ...mergeEntity(undefined, { name, kind: 'place', description: '' }, 0),
  ...(partOf && { partOf }),
});

describe('roomOf', () => {
  const kessmouth = place('Kessmouth');
  const inn = place('Drowned Lantern', kessmouth.id);
  const skerry = place('Skerry');
  const gull = place('Gull');
  const places = [kessmouth, inn, skerry, gull];

  it('files a room word or a possessive under the outermost place', () => {
    expect(roomOf('machinery room', 'You climb down.', skerry, places)).toBe(skerry);
    expect(roomOf("Hedda's room", 'You knock.', inn, places)).toBe(kessmouth);
    expect(roomOf('your room', 'You rest.', inn, places)).toBe(kessmouth);
  });

  it('files "the X of the Y" naming where you are or its outermost', () => {
    expect(roomOf('scullery', 'You slip into the scullery of the Drowned Lantern.', inn, places)).toBe(kessmouth);
    expect(roomOf('scullery', "Kessmouth's scullery is cold.", inn, places)).toBe(kessmouth);
    expect(roomOf('scullery', 'You slip into the scullery.', inn, places)).toBeUndefined();
  });

  it("files the batch fold's new rooms under where the scene was at the range's end", () => {
    const adv = createBlankAdventure('T', '');
    const cellar = place('wine cellar');
    const sea = place('open sea');
    const old = place('boathouse');
    adv.entities = [kessmouth, inn, old, cellar, sea];
    adv.plot.sceneLog = [
      { at: 0, location: skerry.id },
      { at: 3, location: inn.id },
      { at: 9, location: skerry.id },
    ];
    fileRooms(adv, [kessmouth, inn, old], 'You go down.', 9);
    expect(adv.entities.map((e) => e.partOf)).toEqual([undefined, kessmouth.id, undefined, kessmouth.id, undefined]);
  });

  it('notePlace files a room of the previous place with no ask, and asks for any other place', () => {
    const adv = createBlankAdventure('T', '');
    adv.entities = [kessmouth, inn];
    adv.plot.scene = { location: inn.id, present: [] };
    expect(notePlace(adv, 'the loft', 3, 'You climb to the loft.')).toBe(true);
    expect(adv.entities[2]).toMatchObject({ name: 'the loft', partOf: kessmouth.id });
    expect(adv.scriptState.__placeAsk).toBeUndefined();
    notePlace(adv, 'the jetty', 4);
    expect(adv.entities[3]?.partOf).toBeUndefined();
    expect(adv.scriptState.__placeAsk).toEqual({ place: 'the jetty', inside: 'Drowned Lantern' });
  });

  it('keeps asking for a place that is not a room', () => {
    expect(roomOf('open sea', 'The boat drifts out.', skerry, places)).toBeUndefined();
    expect(roomOf('Deep Bay Harbor', 'You sail into Deep Bay Harbor.', gull, places)).toBeUndefined();
  });
});
