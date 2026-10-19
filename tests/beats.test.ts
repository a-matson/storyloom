import { describe, expect, it } from 'vitest';
import { exportAdventureJson, importAdventureJson } from '@adapters/transfer';
import { BEATS, cleanBeats, DEFAULT_BEATS, genreKeys, GENRE_BEATS, repertoire, suggestedBeats } from '@core/director';
import { byPlayer, YOU } from '@core/memory';
import { createBlankAdventure, type Assertion, type Entity } from '@core/model';
import * as S from '@core/schema';

const tamsin: Entity = { id: 'ent_t', kind: 'character', name: 'Tamsin', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 };
const event = (who: string[], text: string, at = 1): Assertion => byPlayer(who[0] ?? YOU, at, { kind: 'event', text, who });

describe('repertoire', () => {
  it('is the genre default per tag, then the title, else the default', () => {
    expect(repertoire(tamsin, ['mystery'])).toEqual(GENRE_BEATS['mystery']);
    expect(repertoire(tamsin, genreKeys({ tags: [], title: 'Slice of life' }))).toEqual(GENRE_BEATS['slice-of-life']);
    expect(repertoire(tamsin, ['dice', 'western'])).toEqual(DEFAULT_BEATS);
  });

  it('is the stored list over the default, an empty one included', () => {
    expect(repertoire({ beats: ['quote scripture'] }, ['fantasy'])).toEqual(['quote scripture']);
    expect(repertoire({ beats: [] }, ['fantasy'])).toEqual([]);
  });

  it('draws on known, unique beats, 8 to 12 per genre', () => {
    const ids = BEATS.map((b) => b.id);
    expect(new Set(ids).size).toBe(12);
    for (const list of Object.values(GENRE_BEATS)) {
      expect(list.length).toBeGreaterThanOrEqual(8);
      expect(list.length).toBeLessThanOrEqual(12);
      expect(list.every((b) => ids.includes(b))).toBe(true);
    }
  });
});

describe('suggestedBeats', () => {
  const lies = [event([tamsin.id, YOU], 'Tamsin lied about the letter.'), event([tamsin.id], 'Tamsin lied to the guard.', 2)];
  const tags = ['slice-of-life'];

  it('suggests a beat shown in two of their own events', () => {
    expect(suggestedBeats(tamsin, lies, tags)).toEqual(['lie']);
    expect(suggestedBeats(tamsin, lies.slice(0, 1), tags)).toEqual([]);
  });

  it('not one already in the repertoire, ended, or someone else did', () => {
    expect(suggestedBeats(tamsin, lies, ['mystery'])).toEqual([]);
    expect(suggestedBeats(tamsin, [lies[0]!, { ...lies[1]!, until: 3 }], tags)).toEqual([]);
    expect(
      suggestedBeats(
        tamsin,
        lies.map((e) => (e.kind === 'event' ? { ...e, who: ['ent_o', tamsin.id] } : e)),
        tags,
      ),
    ).toEqual([]);
  });
});

describe('beats on the entity', () => {
  it('clean to trimmed, non-empty, unrepeated, at most 12', () => {
    expect(cleanBeats([' joke ', '', 'Joke', 'lie'])).toEqual(['Joke', 'lie']);
    expect(cleanBeats(Array.from({ length: 20 }, (_, i) => `b${i}`))).toHaveLength(12);
  });

  it('parse without beats and round-trip our export', () => {
    expect(S.Entity.parse(tamsin)).not.toHaveProperty('beats');
    const a = createBlankAdventure('T', 'You wake.');
    a.entities = [{ ...tamsin, beats: ['joke', 'quote scripture'] }];
    expect(importAdventureJson(exportAdventureJson(a)).adventure.entities[0]?.beats).toEqual(['joke', 'quote scripture']);
  });
});
