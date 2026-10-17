import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { mergeEntity } from '@core/memory/entities';
import { sceneIds, sceneNames } from '@core/memory/names';
import { namedIn, namedScene, nextScene, PRESENCE_CAP, SCENE_LOG_CAP, withScene } from '@core/memory/scene';
import type { Entity, PlotComponents, Scene } from '@core/model/types';
import type { SceneRead } from '@core/schema/extraction';

const name = (n: string) => (n.toLowerCase() === 'you' ? undefined : n === 'the dragon' ? 'Weever' : n);
const mill: Scene = { location: 'the mill', present: ['Lena'] };
const timed: Scene = { ...mill, time: { day: 3, part: 'night' } };
const source = { sourceId: 'a9', sourceHash: 'h' };
const read = (r: Partial<SceneRead>): SceneRead => ({ location: 'the mill', present: [], stay: {}, weather: 'unchanged', ...r });
const went = (room: string) => ({ room });
const place = (n: string, partOf?: Entity) => ({
  ...mergeEntity(undefined, { name: n, kind: 'place', description: '' }, 0),
  ...(partOf && { partOf: partOf.id }),
});
const everyone = () => true;
const next = (scene: Scene | undefined, r: Parameters<typeof read>[0], places: Entity[] = [], at = 7, named: (n: string) => boolean = everyone) =>
  nextScene(scene, read(r), name, at, places, named);

describe('nextScene', () => {
  it('keeps everyone not marked left: a sleeper the reply leaves out stays, the listed join, the left go', () => {
    const scene: Scene = { location: 'the mill', present: ['Lena', 'Minos'] };
    expect(next(scene, { present: ['Lena', 'the dragon', 'You'] }).scene?.present).toEqual(['Lena', 'Minos', 'Weever']);
    expect(next(scene, { present: ['Lena'], stay: { Lena: 'here', Minos: 'left' } }).scene?.present).toEqual(['Lena']);
    expect(next(scene, { present: ['Lena', 'Minos'], stay: { Minos: 'left' } }).scene?.present).toEqual(['Lena']);
  });

  it('stay: left removes a character, asleep keeps them', () => {
    const scene: Scene = { location: 'the mill', present: ['Lena', 'Minos'] };
    expect(next(scene, { present: [], stay: { Lena: 'left', Minos: 'asleep' } }).scene?.present).toEqual(['Minos']);
  });

  it('ignores a leave for someone who was not there, and returns an unchanged scene itself', () => {
    expect(next(mill, { present: ['Lena'], stay: { Corwin: 'left' } })).toEqual({ scene: mill, moved: false });
  });

  it('resets to the listed names on a change of place, and stamps `since` only then', () => {
    expect(next({ ...mill, since: 2 }, { location: 'the road', present: ['Corwin'] })).toEqual({
      scene: { location: 'the road', present: ['Corwin'], since: 7 },
      moved: true,
    });
    expect(next({ ...mill, since: 2 }, { present: ['Corwin'] }).scene?.since).toBe(2);
  });

  it('on a change of place keeps who the read has here or asleep: they came along', () => {
    const scene: Scene = { location: 'the mill', present: ['Lena', 'Minos', 'Corwin'] };
    const r = next(scene, { location: 'the road', present: [], stay: { Lena: 'here', Minos: 'asleep', Corwin: 'left' } });
    expect(r.scene?.present).toEqual(['Lena', 'Minos']);
  });

  it('a read cannot re-add a character the passage does not name', () => {
    const scene: Scene = { location: 'the mill', present: ['Minos'] };
    expect(next(scene, { present: ['Minos', 'Vorthak'] }, [], 7, (n) => n === 'Minos').scene).toBe(scene);
  });

  it('an arrival named in the passage is added', () => {
    const scene: Scene = { location: 'the mill', present: ['Minos'] };
    expect(next(scene, { present: ['Vorthak'] }, [], 7, (n) => n === 'Vorthak').scene?.present).toEqual(['Minos', 'Vorthak']);
  });

  it('a leave counts only when the passage names who left', () => {
    const scene: Scene = { location: 'the mill', present: ['Minos', 'Vorthak'] };
    expect(next(scene, { stay: { Minos: 'here', Vorthak: 'left' } }, [], 7, (n) => n === 'Minos').scene).toBe(scene);
  });

  it('takes place identity from the place cards and stores the card name', () => {
    const cottage = place('Cottage');
    const scene: Scene = { location: 'Cottage', present: ['Lena'] };
    expect(next(scene, { location: 'the cottage', present: [] }, [cottage])).toEqual({ scene, moved: false });
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

  it('writes no time, and keeps the player’s across a read and a move', () => {
    expect(next(undefined, {}, [], 0).scene).toEqual({ location: 'the mill', present: [], since: 0 });
    expect(next(timed, { weather: 'rain' }).scene).toEqual({ ...timed, weather: 'rain' });
    expect(next(timed, { location: 'the road' }).scene).toEqual({ location: 'the road', present: [], time: timed.time, since: 7 });
    expect(next(timed, { present: ['Lena'] }).scene).toBe(timed);
  });
});

describe('zones (M21-1)', () => {
  // The mill, as `read` defaults to it.
  const inn = place('the mill');
  const cellar = place('Cellar', inn);
  const road = place('The Road');
  const atInn: Scene = { location: 'the mill', present: ['Vorthak', 'Weever'] };
  const below: Scene = { ...atInn, zones: { Vorthak: 'the basement', Weever: 'the basement' } };
  const places = [inn, cellar, road];

  it('left for a room of this place keeps them present in it', () => {
    const r = next(atInn, { stay: { Vorthak: went('the basement'), Weever: went('the basement') } }, places);
    expect(r).toEqual({ scene: below, moved: false });
    expect(next(atInn, { stay: { Vorthak: went('Cellar') } }, places).scene?.zones).toEqual({ Vorthak: 'Cellar' });
  });

  it('left, an empty room, or a room of another place is gone as before', () => {
    expect(next(atInn, { stay: { Vorthak: 'left' } }, places).scene).toEqual({ ...atInn, present: ['Weever'] });
    expect(next(atInn, { stay: { Vorthak: went(' ') } }, places).scene).toEqual({ ...atInn, present: ['Weever'] });
    expect(next(atInn, { stay: { Vorthak: went('the road') } }, places).scene).toEqual({ ...atInn, present: ['Weever'] });
  });

  it('here clears the room; a later read that keeps them there, or does not name them, keeps it', () => {
    expect(next(below, { stay: { Vorthak: 'here', Weever: went('the basement') } }, places).scene?.zones).toEqual({ Weever: 'the basement' });
    expect(next(below, { stay: { Vorthak: 'asleep', Weever: 'asleep' } }, places).scene).toBe(below);
    expect(next(below, { stay: { Vorthak: 'here' } }, places, 7, (n) => n === 'Weever').scene).toBe(below);
  });

  it('a room that is yours is no room; a move drops the rooms', () => {
    const cellarScene: Scene = { ...atInn, location: 'Cellar' };
    expect(next(cellarScene, { location: 'Cellar', stay: { Vorthak: went('the cellar') } }, places).scene).toBe(cellarScene);
    const moved = next(below, { location: 'the road', stay: { Vorthak: 'here', Weever: went('the basement') } }, places);
    expect(moved.scene).toEqual({ location: 'The Road', present: ['Vorthak'], since: 7 });
  });

  it('presence logs who is with you, so a zoned character gets an away gap', () => {
    const plot = withScene({ scene: atInn }, read({ stay: { Vorthak: went('the basement') } }), name, 4, source, places, 'Vorthak goes down.');
    expect(plot.scene?.present).toEqual(['Vorthak', 'Weever']);
    expect(plot.presence).toEqual([{ at: 4, present: ['Weever'] }]);
  });

  it('stores the room keys as ids, and reads them back as names', () => {
    const vorthak = mergeEntity(undefined, { name: 'Vorthak', kind: 'character', description: '' }, 0);
    const stored: Scene = { location: 'the mill', present: [vorthak.id], zones: { [vorthak.id]: 'the basement' } };
    expect(namedScene(stored, [vorthak])).toEqual({ location: 'the mill', present: ['Vorthak'], zones: { Vorthak: 'the basement' } });
    const plot = withScene({ scene: { ...stored, zones: {} } }, read({ stay: { Vorthak: went('the cellar') } }), name, 4, source, [vorthak], 'Vorthak.');
    expect(plot.scene?.zones).toEqual({ [vorthak.id]: 'the cellar' });
    expect(withScene(plot, read({}), name, 5, source, [vorthak], '')).toBe(plot);
  });
});

describe('withScene', () => {
  const w = (plot: PlotComponents, r: Parameters<typeof read>[0], at: number) => withScene(plot, read(r), name, at, source, [], 'Lena and Minos.');

  it('an alias in the passage counts ("the dragon")', () => {
    const weever = { ...mergeEntity(undefined, { name: 'Weever', kind: 'character', description: '' }, 0), aliases: ['the dragon'] };
    expect(namedIn([weever], 'The dragon lands.')('Weever')).toBe(true);
    expect(namedIn([weever], 'Lena waits.')('Weever')).toBe(false);
    expect(namedIn([], 'Corwin waits.')('Corwin')).toBe(true);
    const plot = withScene({ scene: mill }, read({ present: ['Weever'] }), name, 3, source, [weever], 'The dragon lands.');
    expect(plot.scene?.present).toEqual(['Lena', weever.id]);
  });

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

  it('logs who is present only when the set changes, capped', () => {
    const joined = w({ scene: mill }, { present: ['Minos'] }, 3);
    expect(joined.presence).toEqual([{ at: 3, present: ['Lena', 'Minos'] }]);
    expect(w(joined, { weather: 'rain' }, 4).presence).toEqual(joined.presence);
    expect(w(joined, { stay: { Minos: 'left' } }, 5).presence?.at(-1)).toEqual({ at: 5, present: ['Lena'] });
    const presence = Array.from({ length: PRESENCE_CAP }, (_, i) => ({ at: i, present: [`p${i}`] }));
    const capped = w({ scene: mill, presence }, { present: ['Minos'] }, 300).presence;
    expect(capped).toHaveLength(PRESENCE_CAP);
    expect(capped?.at(-1)).toEqual({ at: 300, present: ['Lena', 'Minos'] });
  });
});

describe('scene ids (M13-2d option B)', () => {
  const mill_ = place('the mill');
  const lena = mergeEntity(undefined, { name: 'Lena Morrow', kind: 'character', description: '' }, 0);

  it('stores the id `knownAs` resolves, keeps a name nothing matches, and returns an unchanged scene itself', () => {
    const ids = sceneIds({ location: 'The Mill', present: ['Lena', 'Corwin'] }, [mill_, lena]);
    expect(ids).toEqual({ location: mill_.id, present: [lena.id, 'Corwin'] });
    expect(sceneIds(ids, [mill_, lena])).toBe(ids);
    // A place name is not a character, nor the reverse.
    expect(sceneIds({ location: 'Lena Morrow', present: ['the mill'] }, [mill_, lena])).toEqual({ location: 'Lena Morrow', present: ['the mill'] });
  });

  it('shows the current name, so a rename carries over', () => {
    const renamed = { ...lena, name: 'Lena Ashby' };
    expect(renderScene({ location: mill_.id, present: [lena.id, 'Corwin'] }, [mill_, renamed])).toBe('the mill · Present: Lena Ashby, Corwin');
    expect(sceneNames({ present: [lena.id] }, [renamed])).toEqual({ present: ['Lena Ashby'] });
  });

  it('a turn read resolves a plain name that got a card since, and logs the place by name', () => {
    const plot = withScene({ scene: { location: 'the mill', present: ['Lena'] } }, read({}), name, 4, source, [mill_, lena], '');
    expect(plot.scene).toMatchObject({ location: mill_.id, present: [lena.id] });
    expect(withScene(plot, read({}), name, 5, source, [mill_, lena], '')).toBe(plot);
    const road = place('the road');
    const moved = withScene(plot, read({ location: 'the road', present: ['Lena'] }), name, 6, source, [mill_, road, lena], 'Lena walks.');
    expect(moved.scene).toMatchObject({ location: road.id, present: [lena.id], since: 6 });
    expect(moved.sceneLog).toEqual([{ at: 6, location: 'the road' }]);
  });
});

describe('renderScene', () => {
  it('writes one line and leaves out what is unknown', () => {
    expect(renderScene({ ...mill, present: ['Lena', 'Morrow'], weather: 'rain' })).toBe('the mill · Present: Lena, Morrow · Rain');
    expect(renderScene({ ...mill, items: ['the ledger'] })).toBe('the mill · Present: Lena · Here: the ledger');
    expect(renderScene({ present: [] })).toBe('');
    expect(renderScene(undefined)).toBe('');
  });

  it('sends the time right after the location', () => {
    expect(renderScene(timed)).toBe('the mill · Day 3, night · Present: Lena');
    expect(renderScene({ present: [], time: { day: 1, part: 'dawn' } })).toBe('Day 1, dawn');
  });
});
