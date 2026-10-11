import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { nextScene, SCENE_LOG_CAP, withScene } from '@core/memory/scene';
import type { PlotComponents, Scene } from '@core/model/types';

const name = (n: string) => (n.toLowerCase() === 'you' ? undefined : n === 'morrow' ? 'Morrow' : n);
const mill: Scene = { location: 'the mill', present: ['Lena'] };
// An adventure saved while the clock existed.
const oldSave: Scene = { ...mill, time: { day: 3, part: 'night' } };
const source = { sourceId: 'a9', sourceHash: 'h' };

describe('nextScene', () => {
  it('moves to a named place with the cast the reply names, dropping the player and resolving entity names', () => {
    const next = nextScene(mill, { location: "Blackmore's study", present: ['morrow', 'You', ' '] }, name, 7);
    expect(next).toEqual({ location: "Blackmore's study", present: ['Morrow'], since: 7 });
  });

  it('keeps the place, the player-set cast and weather when the reply omits them', () => {
    const scene: Scene = { ...mill, weather: 'Fog' };
    expect(nextScene(scene, { location: ' ', present: [] }, name, 3)).toBe(scene);
    expect(nextScene(scene, { weather: 'rain' }, name, 3)).toEqual({ ...scene, weather: 'rain' });
  });

  it('drops a value that says there is none, in any field', () => {
    const none = { location: 'Not specified', present: ['None specified', 'Lena'], items: ['None'], weather: 'Not specified' };
    expect(nextScene(mill, none, name, 3)).toBe(mill);
  });

  it('keeps weather only when it is weather', () => {
    expect(nextScene(mill, { weather: 'late-night traffic' }, name, 3)).toBe(mill);
    expect(nextScene(mill, { weather: 'windy' }, name, 3)).toEqual({ ...mill, weather: 'windy' });
  });

  it('clears the cast in a new place that names nobody, keeps it in the same place', () => {
    expect(nextScene(mill, { location: 'the road', present: [] }, name, 4)).toEqual({ location: 'the road', present: [], since: 4 });
    expect(nextScene(mill, { location: 'the mill', present: [] }, name, 4)).toBe(mill);
  });

  it('keeps `since` until the location changes, and reads named items', () => {
    const scene: Scene = { ...mill, since: 2 };
    expect(nextScene(scene, { items: ['the ledger', 'the ledger'] }, name, 5)).toEqual({ ...scene, items: ['the ledger'] });
  });

  it('writes no time, and drops an old save’s clock on the next change', () => {
    expect(nextScene(undefined, { location: 'the mill' }, name, 0)).toEqual({ location: 'the mill', present: [], since: 0 });
    expect(nextScene(oldSave, { weather: 'rain' }, name, 3)).toEqual({ ...mill, weather: 'rain' });
  });
});

describe('withScene', () => {
  it('logs a location change and stamps the source; an unchanged scene leaves the plot alone', () => {
    const plot: PlotComponents = { scene: mill };
    const next = withScene(plot, { location: 'the road' }, name, 6, source);
    expect(next.scene).toMatchObject({ location: 'the road', since: 6, ...source });
    expect(next.sceneLog).toEqual([{ at: 6, location: 'the road' }]);
    expect(withScene(next, { location: 'the road' }, name, 8, source)).toBe(next);
    expect(withScene(next, { weather: 'rain' }, name, 8, source).sceneLog).toEqual([{ at: 6, location: 'the road' }]);
  });

  it('caps the log', () => {
    const sceneLog = Array.from({ length: SCENE_LOG_CAP }, (_, i) => ({ at: i, location: `p${i}` }));
    const next = withScene({ scene: mill, sceneLog }, { location: 'the road' }, name, 99, source);
    expect(next.sceneLog).toHaveLength(SCENE_LOG_CAP);
    expect(next.sceneLog?.at(-1)).toEqual({ at: 99, location: 'the road' });
    expect(next.sceneLog?.[0]).toEqual({ at: 1, location: 'p1' });
  });
});

describe('renderScene', () => {
  it('writes one line and leaves out what is unknown', () => {
    expect(renderScene({ ...mill, present: ['Lena', 'Morrow'], weather: 'rain' })).toBe('the mill · Present: Lena, Morrow · Rain');
    expect(renderScene({ ...mill, items: ['the ledger'] })).toBe('the mill · Present: Lena · Here: the ledger');
    expect(renderScene({ present: [] })).toBe('');
    expect(renderScene(undefined)).toBe('');
  });

  it('never sends an old save’s clock', () => {
    expect(renderScene(oldSave)).toBe('the mill · Present: Lena');
    expect(renderScene({ present: [], time: { day: 1, part: 'dawn' } })).toBe('');
  });
});
