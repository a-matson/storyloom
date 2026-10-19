import type { Adventure, Entity } from '../model/types';
import { knownAs, namesOf, outermost, words } from './names';

/** A place name ending in one of these is a room of where the scene is ("machinery room", "keeper's cell"). [provisional] */
export const ROOM_WORDS =
  / (?:room|cellar|chamber|kitchen|hall|stairs?|stairwell|staircase|corridor|passage|basement|attic|door|quarters|level|platform|cell|landing|interior|deck|cabin|gallery|loft|yard|porch) $/;
/** "your room", "Hedda's room": someone's, so somewhere in the place they are. */
const POSSESSIVE = /^(?:your|my|his|her|their|our|\p{L}+['’]s) /iu;
const bare = (s: string) => words(s).replace(/^ the /, ' ');

/**
 * The place to file the new place `name` under (`inside`'s outermost) when it reads as one of its rooms: the
 * passage says "the X of (the) Y" or "Y's X" with Y `inside` or its outermost, or the name ends in a room word or
 * opens with a possessive. Else undefined, and the player is asked.
 */
export function roomOf(name: string, passage: string, inside: Entity, places: readonly Entity[]): Entity | undefined {
  const top = outermost(places, inside) ?? inside;
  const x = bare(name).trim();
  const text = words(passage);
  const said = [inside, top]
    .flatMap(namesOf)
    .map((n) => bare(n).trim())
    .some((y) => y !== '' && [`${x} of ${y}`, `${x} of the ${y}`, `${y} s ${x}`].some((p) => text.includes(` ${p} `)));
  return said || ROOM_WORDS.test(` ${x} `) || POSSESSIVE.test(name.trim()) ? top : undefined;
}

/** The place a scene location (an id, else a name) is. */
export const placeAt = (places: readonly Entity[], location: string | undefined): Entity | undefined =>
  location === undefined ? undefined : (places.find((e) => e.id === location) ?? knownAs(places, location));

/** The batch fold's new places (not in `before`) filed under where the scene was at the range's end (`sceneLog`) when `roomOf` reads them as rooms. */
export function fileRooms(adventure: Adventure, before: readonly Entity[], passage: string, toAction: number): void {
  const places = adventure.entities.filter((e) => e.kind === 'place');
  const inside = placeAt(places, adventure.plot.sceneLog?.findLast((s) => s.at < toAction)?.location);
  adventure.entities = adventure.entities.map((e) => {
    const room =
      e.kind === 'place' && !e.partOf && inside && inside !== e && !before.some((b) => b.id === e.id) ? roomOf(e.name, passage, inside, places) : undefined;
    return room && room !== e ? { ...e, partOf: room.id } : e;
  });
}
