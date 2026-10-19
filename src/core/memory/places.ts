import type { Entity, PlotComponents } from '../model/types';
import { outermost } from './names';
import { placeAt } from './rooms';

// The place graph (M27-4): `connectedTo` links read both ways, between outermost places (a room's link is its house's).

export interface Edge {
  a: string;
  b: string;
  via?: string;
}

const places = (entities: readonly Entity[]) => entities.filter((e) => e.kind === 'place');
const topOf = (ps: readonly Entity[], id: string) =>
  outermost(
    ps,
    ps.find((p) => p.id === id),
  )?.id;

/** Outermost place ids and the links between them, each pair once; a link to a missing place or within one place is dropped. */
export function outerGraph(entities: readonly Entity[]): { nodes: string[]; edges: Edge[] } {
  const ps = places(entities);
  const top = (id: string) => topOf(ps, id);
  const nodes = [...new Set(ps.flatMap((p) => top(p.id) ?? []))];
  const edges = new Map<string, Edge>();
  for (const p of ps)
    for (const c of p.connectedTo ?? []) {
      const [a, b] = [top(p.id), top(c.id)];
      const key = a && b && (a < b ? `${a}|${b}` : `${b}|${a}`);
      if (a && b && key && a !== b && !edges.has(key)) edges.set(key, { a, b, ...(c.via !== undefined && { via: c.via }) });
    }
  return { nodes, edges: [...edges.values()] };
}

/** The link between the outermost places of `a` and `b`, either way round. */
export function linked(entities: readonly Entity[], a: string, b: string): Edge | undefined {
  const ps = places(entities);
  const [x, y] = [topOf(ps, a), topOf(ps, b)];
  return outerGraph(entities).edges.find((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x));
}

/** `a` links to `b` (stored on `a`); a link already there is kept, its `via` replaced when one is given. */
export function link(entities: readonly Entity[], a: string, b: string, via?: string): Entity[] {
  if (a === b) return [...entities];
  const to = { id: b, ...(via?.trim() && { via: via.trim() }) };
  return entities.map((e) => (e.id === a && e.kind === 'place' ? { ...e, connectedTo: [...(e.connectedTo ?? []).filter((c) => c.id !== b), to] } : e));
}

function drop(e: Entity, other: string): Entity {
  const rest = (e.connectedTo ?? []).filter((c) => c.id !== other);
  const { connectedTo: _c, ...bare } = e;
  return rest.length ? { ...e, connectedTo: rest } : bare;
}

/** No link between `a` and `b` either way. */
export function unlink(entities: readonly Entity[], a: string, b: string): Entity[] {
  return entities.map((e) => (e.id === a ? drop(e, b) : e.id === b ? drop(e, a) : e));
}

/** Links to `from` point at `to` (a merge); one that would link a place to itself goes. */
export function repointLinks(entities: readonly Entity[], from: string, to: string): Entity[] {
  return entities.map((e) =>
    e.connectedTo ? { ...e, connectedTo: e.connectedTo.map((c) => (c.id === from ? { ...c, id: to } : c)).filter((c) => c.id !== e.id) } : e,
  );
}

/** A `/travel` from `from` to `to` (ids or names): between two known outermost places with no link, the link is written and named. */
export function linkWay(entities: readonly Entity[], from: string | undefined, to: string): { entities: Entity[]; linked?: readonly [string, string] } {
  const ps = places(entities);
  const [a, b] = [from, to].map((l) => outermost(ps, placeAt(ps, l)));
  if (!a || !b || a === b || linked(entities, a.id, b.id)) return { entities: [...entities] };
  return { entities: link(entities, a.id, b.id), linked: [a.name, b.name] };
}

/** The `via` of the link the last move went along, while the scene is still where it went. */
export function cameThrough(plot: PlotComponents, entities: readonly Entity[]): string | undefined {
  const ps = places(entities);
  const [prev, last] = [plot.sceneLog?.at(-2), plot.sceneLog?.at(-1)].map((s) => placeAt(ps, s?.location));
  const here = placeAt(ps, plot.scene?.location);
  if (!prev || !last || !here || outermost(ps, here) !== outermost(ps, last)) return undefined;
  return linked(entities, prev.id, last.id)?.via;
}
