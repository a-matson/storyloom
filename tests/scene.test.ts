import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { nextScene } from '@core/memory/scene';
import type { ExtractionJson, Scene } from '@core/model/types';

const reply = (over: Partial<ExtractionJson> = {}): ExtractionJson => ({ scene: {}, entities: [], speakers: [], ...over });
const isName = (n: string) => n !== '' && n.toLowerCase() !== 'you';
const mill: Scene = { location: 'the mill', present: ['Lena'] };
// An adventure saved while the clock existed.
const oldSave: Scene = { ...mill, time: { day: 3, part: 'night' } };

describe('nextScene', () => {
  it('moves to a named place with the cast the reply names, dropping the player', () => {
    const next = nextScene(mill, reply({ scene: { location: "Blackmore's study", present: ['Morrow', 'You', ' '] } }), isName);
    expect(next).toEqual({ location: "Blackmore's study", present: ['Morrow'] });
  });

  it('keeps the place, the player-set cast and weather when the reply omits them', () => {
    const scene: Scene = { ...mill, weather: 'Fog' };
    expect(nextScene(scene, reply({ scene: { location: ' ', present: [] } }), isName)).toBe(scene);
    expect(nextScene(scene, reply({ scene: { weather: 'rain' } }), isName)).toEqual({ ...scene, weather: 'rain' });
  });

  it('writes no time, and drops an old save’s clock on the next change', () => {
    expect(nextScene(undefined, reply({ scene: { location: 'the mill' } }), isName)).toEqual({ location: 'the mill', present: [] });
    expect(nextScene(oldSave, reply({ scene: { weather: 'rain' } }), isName)).toEqual({ ...mill, weather: 'rain' });
  });
});

describe('renderScene', () => {
  it('writes one line and leaves out what is unknown', () => {
    expect(renderScene({ ...mill, present: ['Lena', 'Morrow'], weather: 'rain' })).toBe('the mill · Present: Lena, Morrow · Rain');
    expect(renderScene({ present: [] })).toBe('');
    expect(renderScene(undefined)).toBe('');
  });

  it('never sends an old save’s clock', () => {
    expect(renderScene(oldSave)).toBe('the mill · Present: Lena');
    expect(renderScene({ present: [], time: { day: 1, part: 'dawn' } })).toBe('');
  });
});
