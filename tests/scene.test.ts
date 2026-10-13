import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { mergeEntity } from '@core/memory/entities';
import { nextScene, SCENE_LOG_CAP, withScene } from '@core/memory/scene';
import type { Entity, PlotComponents, Scene } from '@core/model/types';
import type { SceneRead } from '@core/schema/extraction';

const name = (n: string) => (n.toLowerCase() === 'you' ? undefined : n === 'the dragon' ? 'Weever' : n);
const mill: Scene = { location: 'the mill', present: ['Lena'] };
// An adventure saved while the clock existed.
const oldSave: Scene = { ...mill, time: { day: 3, part: 'night' } };
const source = { sourceId: 'a9', sourceHash: 'h' };
const read = (r: Partial<SceneRead>): SceneRead => ({ moved: false, location: 'the mill', present: [], left: [], weather: 'unchanged', ...r });
const place = (n: string, partOf?: Entity) => ({
  ...mergeEntity(undefined, { name: n, kind: 'place', description: '', facts: [] }, 0),
  ...(partOf && { partOf: partOf.id }),
});
const next = (scene: Scene | undefined, r: Partial<SceneRead>, places: Entity[] = [], at = 7) => nextScene(scene, read(r), name, at, places);

describe('nextScene', () => {
  it('keeps everyone not in `left`: a sleeper the reply leaves out stays, the listed join, the left go', () => {
    const scene: Scene = { location: 'the mill', present: ['Lena', 'Minos'] };
    expect(next(scene, { present: ['Lena', 'the dragon', 'You'] }).scene?.present).toEqual(['Lena', 'Minos', 'Weever']);
    expect(next(scene, { present: ['Lena'], left: ['Minos'] }).scene?.present).toEqual(['Lena']);
    expect(next(scene, { present: ['Lena', 'Minos'], left: ['Minos'] }).scene?.present).toEqual(['Lena']);
  });

  it('ignores `left` for someone who was not there, and returns an unchanged scene itself', () => {
    expect(next(mill, { present: ['Lena'], left: ['Corwin'] })).toEqual({ scene: mill, moved: false });
  });

  it('resets to the listed names on a change of place, and stamps `since` only then', () => {
    expect(next({ ...mill, since: 2 }, { location: 'the road', present: ['Corwin'] })).toEqual({
      scene: { location: 'the road', present: ['Corwin'], since: 7 },
      moved: true,
    });
    expect(next({ ...mill, since: 2 }, { present: ['Corwin'] }).scene?.since).toBe(2);
  });

  it('takes place identity from the place cards, not the `moved` flag, and stores the card name', () => {
    const cottage = place('Cottage');
    const scene: Scene = { location: 'Cottage', present: ['Lena'] };
    expect(next(scene, { moved: true, location: 'the cottage', present: [] }, [cottage])).toEqual({ scene, moved: false });
    expect(next({ ...scene, location: 'cottage in the woods' }, { location: 'the cottage' }, [cottage]).scene?.location).toBe('Cottage');
  });

  it('logs no move for a room inside the current place', () => {
    const cottage = place('Cottage');
    const bedroom = place('Bedroom', cottage);
    const r = next({ location: 'Cottage', present: ['Lena'], since: 1 }, { location: 'the bedroom', present: [] }, [cottage, bedroom]);
    expect(r).toEqual({ scene: { location: 'Bedroom', present: ['Lena'], since: 1 }, moved: false });
  });

  it('keeps the weather on `unchanged`, clears it on `none`, else takes the word', () => {
    const wet: Scene = { ...mill, weather: 'rain' };
    expect(next(wet, { present: ['Lena'] }).scene).toBe(wet);
    expect(next(wet, { weather: 'none' }).scene).toEqual(mill);
    expect(next(mill, { weather: 'fog' }).scene).toEqual({ ...mill, weather: 'fog' });
  });

  it('keeps the player’s items in the same place and drops them on a move; drops `nobody`', () => {
    const scene: Scene = { ...mill, items: ['the ledger'] };
    expect(next(scene, { present: ['nobody'] }).scene).toBe(scene);
    expect(next(scene, { location: 'the road', present: ['nobody'] }).scene).toEqual({ location: 'the road', present: [], since: 7 });
  });

  it('writes no time, and drops an old save’s clock on the next change', () => {
    expect(next(undefined, {}, [], 0).scene).toEqual({ location: 'the mill', present: [], since: 0 });
    expect(next(oldSave, { weather: 'rain' }).scene).toEqual({ ...mill, weather: 'rain' });
  });
});

describe('withScene', () => {
  const w = (plot: PlotComponents, r: Partial<SceneRead>, at: number) => withScene(plot, read(r), name, at, source, []);

  it('logs a change of place and stamps the source; an unchanged scene leaves the plot alone', () => {
    const moved = w({ scene: mill }, { location: 'the road' }, 6);
    expect(moved.scene).toMatchObject({ location: 'the road', since: 6, ...source });
    expect(moved.sceneLog).toEqual([{ at: 6, location: 'the road' }]);
    expect(w(moved, { location: 'the road' }, 8)).toBe(moved);
    expect(w(moved, { location: 'the road', weather: 'rain' }, 8).sceneLog).toEqual([{ at: 6, location: 'the road' }]);
  });

  it('caps the log', () => {
    const sceneLog = Array.from({ length: SCENE_LOG_CAP }, (_, i) => ({ at: i, location: `p${i}` }));
    const moved = w({ scene: mill, sceneLog }, { location: 'the road' }, 99);
    expect(moved.sceneLog).toHaveLength(SCENE_LOG_CAP);
    expect(moved.sceneLog?.at(-1)).toEqual({ at: 99, location: 'the road' });
    expect(moved.sceneLog?.[0]).toEqual({ at: 1, location: 'p1' });
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
