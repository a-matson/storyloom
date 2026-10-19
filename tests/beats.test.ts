import { describe, expect, it } from 'vitest';
import { exportAdventureJson, importAdventureJson } from '@adapters/transfer';
import { BEATS, cleanBeats, cueBeat, cueFor, DEFAULT_BEATS, genreKeys, GENRE_BEATS, repertoire, suggestedBeats, usedBeats } from '@core/director';
import { ActionLog } from '@core/log';
import { byPlayer, YOU } from '@core/memory';
import { createBlankAdventure, type ActionType, type Assertion, type Entity } from '@core/model';
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

describe('cues', () => {
  const log = (texts: [ActionType, string][]) => texts.map(([type, text]) => new ActionLog([]).append(type, text));

  it('name the character and open a sentence or a quote', () => {
    for (const b of BEATS) {
      const cue = b.cue('Tamsin');
      expect(cue).toContain('Tamsin');
      expect(/(?:"|, |: )$/.test(cue)).toBe(true);
    }
  });

  it('read back every beat, for one-word and two-word names; ordinary prose is none', () => {
    const cast = [tamsin, { name: 'Father Caradoc' }];
    for (const name of ['Tamsin', 'Father Caradoc'])
      for (const b of BEATS) expect(cueBeat(`${b.cue(name)}Enough.`, cast)).toEqual({ name, beat: b.id, cue: b.cue(name) });
    expect(cueBeat('Tamsin sighs and looks at the river.', cast)).toBeUndefined();
    expect(cueBeat(`${cueFor('sing', 'Tamsin')}low and slow.`, [{ ...tamsin, beats: ['sing'] }])?.beat).toBe('sing');
  });

  it('used beats are the last 3 of their AI openings, oldest first, player lines ignored', () => {
    const t = (beat: string) => `${cueFor(beat, 'Tamsin')}x`;
    const actions = log([
      ['continue', t('lie')],
      ['continue', t('joke')],
      ['do', `> ${t('leave')}`],
      ['continue', 'The rain goes on.'],
      ['continue', t('demand')],
      ['continue', t('reveal')],
    ]);
    expect(usedBeats(actions, tamsin)).toEqual(['joke', 'demand', 'reveal']);
    expect(usedBeats(actions, { name: 'Oren' })).toEqual([]);
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
