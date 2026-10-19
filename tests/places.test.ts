import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { mergeEntities, mergeEntity } from '@core/memory/entities';
import { cameThrough, link, linked, linkWay, outerGraph, repointLinks, unlink } from '@core/memory/places';
import { exportAdventureJson, importAdventureJson } from '@adapters/transfer';
import { createBlankAdventure } from '@core/model';
import type { Entity, PlotComponents } from '@core/model/types';
import { actions, buildContext, input } from './fixtures/structured';

const place = (name: string, over: Partial<Entity> = {}): Entity => ({ ...mergeEntity(undefined, { name, kind: 'place', description: '' }, 0), ...over });
const manor = place('the manor');
const hall = place('the hall', { partOf: manor.id });
const kitchen = place('the kitchen', { partOf: manor.id });
const docks = place('the docks');
const town = place('the town', { connectedTo: [{ id: hall.id, via: 'the gate' }] });
const all = [manor, hall, kitchen, docks, town];

describe('place graph (M27-4)', () => {
  it('folds rooms into their outermost place and reads a link both ways', () => {
    expect(outerGraph(all)).toEqual({ nodes: [manor.id, docks.id, town.id], edges: [{ a: town.id, b: manor.id, via: 'the gate' }] });
    expect(linked(all, kitchen.id, town.id)?.via).toBe('the gate');
    expect(linked(all, manor.id, town.id)).toBeDefined();
    expect(linked(all, docks.id, town.id)).toBeUndefined();
  });

  it('links and unlinks either way round; a link to itself is no link', () => {
    const on = link(all, docks.id, town.id, ' the quay ');
    expect(linked(on, town.id, docks.id)?.via).toBe('the quay');
    expect(linked(unlink(on, town.id, docks.id), docks.id, town.id)).toBeUndefined();
    expect(link(all, docks.id, docks.id)).toEqual(all);
    expect(unlink(all, hall.id, town.id).find((e) => e.id === town.id)).not.toHaveProperty('connectedTo');
  });

  it('a travel between known unlinked places writes one link; a room of the same place or a linked one none', () => {
    const way = linkWay(all, docks.id, 'the kitchen');
    expect(way.linked).toEqual(['the docks', 'the manor']);
    expect(outerGraph(way.entities).edges).toHaveLength(2);
    expect(linkWay(way.entities, docks.id, 'the manor').linked).toBeUndefined();
    expect(linkWay(all, hall.id, 'the kitchen').linked).toBeUndefined();
    expect(linkWay(all, 'nowhere', 'the docks').linked).toBeUndefined();
  });

  it('a merge unions links and repoints those to the merged place', () => {
    const inn = place('the inn', { connectedTo: [{ id: docks.id }] });
    const tavern = place('the tavern', { connectedTo: [{ id: town.id }, { id: inn.id }] });
    const merged = mergeEntities(inn, tavern);
    const rest = repointLinks([merged, docks, place('the road', { connectedTo: [{ id: tavern.id }] })], tavern.id, inn.id);
    expect(rest[0]?.connectedTo).toEqual([{ id: docks.id }, { id: town.id }]);
    expect(rest[2]?.connectedTo).toEqual([{ id: inn.id }]);
  });

  it('an import repoints place links and rooms, and drops a link to a place the export lacks', () => {
    const a = createBlankAdventure('T', 'You wake.');
    a.entities = [manor, { ...hall, connectedTo: [{ id: town.id, via: 'the gate' }, { id: 'ent_gone' }] }, town];
    const [m, h, t] = importAdventureJson(exportAdventureJson(a)).adventure.entities;
    expect(h?.partOf).toBe(m?.id);
    expect(h?.connectedTo).toEqual([{ id: t?.id, via: 'the gate' }]);
    expect(t?.connectedTo).toEqual([{ id: h?.id, via: 'the gate' }]);
  });

  it('the scene line says the way the last move came until the next move', () => {
    const plot = (log: string[], location = log.at(-1)): PlotComponents => ({
      ...(location !== undefined && { scene: { location, present: [] } }),
      sceneLog: log.map((l, at) => ({ at, location: l })),
    });
    expect(cameThrough(plot(['the town', 'the manor']), all)).toBe('the gate');
    expect(cameThrough(plot(['the town', 'the manor'], kitchen.id), all)).toBe('the gate');
    expect(cameThrough(plot(['the town', 'the manor', 'the docks']), all)).toBeUndefined();
    expect(cameThrough(plot(['the town', 'the manor'], 'the docks'), all)).toBeUndefined();
    expect(renderScene({ location: 'the manor', present: [] }, [], undefined, 'the gate')).toBe('the manor (through the gate)');
    const r = buildContext({ ...input(4000), actions, entities: all, plot: plot(['the town', 'the manor'], manor.id) });
    expect(r.sections.find((s) => s.kind === 'scene')?.text).toBe('[Scene: the manor (through the gate)]');
  });
});
