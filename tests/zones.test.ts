import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { mergeEntity } from '@core/memory/entities';
import { sceneIds, sceneNames } from '@core/memory/names';
import { nextScene, withScene } from '@core/memory/scene';
import type { Entity, Scene } from '@core/model/types';
import type { SceneRead } from '@core/schema/extraction';

const name = (n: string) => (n.toLowerCase() === 'you' ? undefined : n);
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
    const cellarScene: Scene = { ...atInn, zone: 'Cellar' };
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
    expect(sceneIds(sceneNames(stored, [vorthak]), [vorthak])).toEqual(stored);
    expect(sceneNames(stored, [vorthak])).toEqual({ location: 'the mill', present: ['Vorthak'], zones: { Vorthak: 'the basement' } });
    const plot = withScene({ scene: { ...stored, zones: {} } }, read({ stay: { Vorthak: went('the cellar') } }), name, 4, source, [vorthak], 'Vorthak.');
    expect(plot.scene?.zones).toEqual({ [vorthak.id]: 'the cellar' });
    expect(withScene(plot, read({}), name, 5, source, [vorthak], '')).toBe(plot);
  });
});

describe('the player’s room (M22-3)', () => {
  const shop = place('the noodle shop');
  const basement = place('Basement', shop);
  const kitchen = place('Kitchen', shop);
  const road = place('The Road');
  const places = [shop, basement, kitchen, road];
  const upstairs: Scene = { location: 'the noodle shop', present: ['Vorthak', 'Weever', 'Minos'], since: 2 };
  const down = { location: 'the basement' };

  it('a read placing you in a room of this place sets zone and keeps the location', () => {
    expect(next({ ...upstairs, present: [] }, down, places)).toEqual({ scene: { ...upstairs, present: [], zone: 'Basement' }, moved: false });
  });

  it('who did not follow stays in your old room; who the passage has here came along', () => {
    const r = next(upstairs, { ...down, stay: { Vorthak: 'here', Weever: went('the shop'), Minos: 'asleep' } }, places);
    expect(r.scene).toEqual({ ...upstairs, zones: { Weever: 'the shop', Minos: 'the noodle shop' }, zone: 'Basement' });
    const plot = withScene({ scene: upstairs }, read({ ...down, stay: { Vorthak: 'here' } }), name, 4, source, places, 'Vorthak follows you down.');
    expect(plot.presence).toEqual([{ at: 4, present: ['Vorthak'] }]);
  });

  it('others not mentioned keep their room; going to theirs puts you with them', () => {
    // Schema order, as stored: an unchanged read returns it.
    const below: Scene = { location: 'the noodle shop', present: upstairs.present, zones: { Weever: 'Kitchen' }, zone: 'Basement', since: 2 };
    expect(next(below, down, places).scene).toBe(below);
    expect(next(below, { location: 'the kitchen' }, places).scene).toEqual({ ...upstairs, zones: { Vorthak: 'Basement', Minos: 'Basement' }, zone: 'Kitchen' });
  });

  it('the place itself clears zone; a move clears zone', () => {
    const below: Scene = { ...upstairs, present: [], zone: 'Basement' };
    expect(next(below, { location: 'the noodle shop' }, places).scene).toEqual({ ...upstairs, present: [] });
    expect(next(below, { location: 'the road' }, places).scene).toEqual({ location: 'The Road', present: [], since: 7 });
  });

  it('the scene line names your room after the place, and nothing without one', () => {
    expect(renderScene(upstairs)).toBe('the noodle shop · Present: Vorthak, Weever, Minos');
    expect(renderScene({ ...upstairs, present: [], zone: 'Basement' })).toBe('the noodle shop · You: Basement');
    expect(renderScene({ ...upstairs, zones: { Weever: 'the noodle shop' }, zone: 'Basement' })).toBe(
      'the noodle shop · You: Basement · Present: Vorthak, Minos · In the noodle shop: Weever',
    );
  });
});
