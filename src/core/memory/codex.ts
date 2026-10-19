import type { Adventure, Entity } from '../model/types';
import { current, identityText, indexAssertions, isCurrent, type AssertionIndex, type AssertionOf } from './assertionIndex';
import { itemsAt } from './items';
import { currentStates, isLook } from './looks';
import { knownAs } from './names';
import { placeAt } from './rooms';
import { standing } from './standing';
import { YOU } from './you';

/** `at`: the action the line came from, so the view can jump to it. */
export interface CodexLine {
  text: string;
  at?: number;
}
export interface CodexEntry {
  title: string;
  lines: CodexLine[];
}
/** What the store says, compiled at open; never stored. */
export interface Codex {
  characters: CodexEntry[];
  places: CodexEntry[];
  /** Items and factions. */
  things: CodexEntry[];
  rules: CodexLine[];
  timeline: CodexLine[];
}

const list = (key: string, values: Record<string, string>) => {
  const v = Object.entries(values).map(([k, x]) => `${k}: ${x}`);
  return v.length ? [{ text: `${key}: ${v.join(', ')}` }] : [];
};
const confirmed = (ix: AssertionIndex, e: Entity, kind: 'voice' | 'goal') => current(ix.of(e.id), kind).findLast((a) => a.seen !== false);

function relationLine(adv: Adventure, ix: AssertionIndex, r: AssertionOf<'relationship'>): CodexLine {
  const from = r.to.toLowerCase() === YOU ? YOU : knownAs(adv.entities, r.to)?.id;
  const s = from === undefined ? undefined : standing(r, ix.all, from);
  const counters = s && (s.trust || s.fear) ? ` (trust ${s.trust} · fear ${s.fear})` : '';
  return { text: `With ${r.to}: ${r.stance}${counters}` };
}

function entryOf(adv: Adventure, ix: AssertionIndex, events: AssertionOf<'event'>[], e: Entity): CodexEntry {
  const as = ix.of(e.id);
  const values = currentStates(as);
  const looks = Object.fromEntries(Object.entries(values).filter(([k]) => isLook(k)));
  const states = Object.fromEntries(Object.entries(values).filter(([k]) => !isLook(k)));
  const voice = confirmed(ix, e, 'voice');
  const goal = confirmed(ix, e, 'goal');
  const identity = identityText(e, as);
  return {
    title: e.name,
    lines: [
      ...(identity ? [{ text: identity }] : []),
      ...list('Looks', looks),
      ...list('State', states),
      ...(voice ? [{ text: `Voice: ${voice.text}` }] : []),
      ...(goal ? [{ text: `Wants: ${goal.text}` }] : []),
      ...(e.beats && e.beats.length > 0 ? [{ text: `Beats: ${e.beats.join(', ')}` }] : []),
      ...current(as, 'relationship').map((r) => relationLine(adv, ix, r)),
      ...events.filter((a) => a.who.includes(e.id)).map((a) => ({ text: a.text, at: a.at })),
    ],
  };
}

/** Ids present at any time while the scene was at `p`, by `sceneLog` stretch and `presence` entry. */
function visitorsOf(adv: Adventure, places: Entity[], p: Entity): Set<string> {
  const log = adv.plot.sceneLog ?? [];
  const presence = adv.plot.presence ?? [];
  const ids = new Set<string>();
  log.forEach((s, i) => {
    if (placeAt(places, s.location) !== p) return;
    const end = log[i + 1]?.at ?? Infinity;
    presence.forEach((q, j) => {
      if (q.at < end && (presence[j + 1]?.at ?? Infinity) > s.at) for (const id of q.present) ids.add(id);
    });
  });
  return ids;
}

function placeEntry(adv: Adventure, ix: AssertionIndex, events: AssertionOf<'event'>[], places: Entity[], p: Entity): CodexEntry {
  const name = (id: string) => (id === YOU ? 'You' : (adv.entities.find((x) => x.id === id)?.name ?? id));
  const rooms = places.filter((x) => x.partOf === p.id).map((x) => x.name);
  const visitors = [...visitorsOf(adv, places, p)].map(name);
  const items = itemsAt(adv.entities, ix, p.name).map((x) => x.name);
  const base = entryOf(adv, ix, events, p);
  return {
    title: p.name,
    lines: [
      ...base.lines,
      ...(rooms.length ? [{ text: `Rooms: ${rooms.join(', ')}` }] : []),
      ...(visitors.length ? [{ text: `Been here: ${visitors.join(', ')}` }] : []),
      ...(items.length ? [{ text: `Items: ${items.join(', ')}` }] : []),
    ],
  };
}

export function compileCodex(adv: Adventure): Codex {
  const ix = indexAssertions(adv.assertions);
  const events = adv.assertions.filter((a): a is AssertionOf<'event'> => a.kind === 'event' && isCurrent(a)).toSorted((a, b) => a.at - b.at);
  const places = adv.entities.filter((e) => e.kind === 'place');
  const of = (kinds: Entity['kind'][]) => adv.entities.filter((e) => kinds.includes(e.kind)).map((e) => entryOf(adv, ix, events, e));
  const moves = (adv.plot.sceneLog ?? []).map((s) => ({ text: `Scene moves to ${s.location}`, at: s.at }));
  return {
    characters: of(['character']),
    places: places.map((p) => placeEntry(adv, ix, events, places, p)),
    things: of(['item', 'faction']),
    rules: adv.rules.map((r) => ({ text: r.status === 'proposed' ? `${r.text} (proposed)` : r.text, at: r.fromAction })),
    timeline: [...events.map((a) => ({ text: a.text, at: a.at })), ...moves].toSorted((a, b) => a.at - b.at),
  };
}

const matches = (text: string, q: string) => text.toLowerCase().includes(q);

/** Lines holding `query` (any case); an entry whose title holds it keeps every line, one with none is dropped. */
export function filterCodex(c: Codex, query: string): Codex {
  const q = query.trim().toLowerCase();
  if (!q) return c;
  const lines = (ls: CodexLine[]) => ls.filter((l) => matches(l.text, q));
  const entries = (es: CodexEntry[]) =>
    es.map((e) => (matches(e.title, q) ? e : { ...e, lines: lines(e.lines) })).filter((e) => matches(e.title, q) || e.lines.length > 0);
  return { characters: entries(c.characters), places: entries(c.places), things: entries(c.things), rules: lines(c.rules), timeline: lines(c.timeline) };
}

const bullet = (l: CodexLine) => `- ${l.at === undefined ? '' : `(${l.at}) `}${l.text}`;
const entriesMd = (es: CodexEntry[]) => es.map((e) => [`### ${e.title}`, ...e.lines.map(bullet)].join('\n'));
const section = (title: string, body: string[]) => (body.length ? [`## ${title}`, ...body].join('\n\n') : '');

export function codexMarkdown(c: Codex): string {
  return [
    section('Characters', entriesMd(c.characters)),
    section('Places', entriesMd(c.places)),
    section('Things', entriesMd(c.things)),
    section('Rules', c.rules.length ? [c.rules.map(bullet).join('\n')] : []),
    section('Timeline', c.timeline.length ? [c.timeline.map(bullet).join('\n')] : []),
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}
