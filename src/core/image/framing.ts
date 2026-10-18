import { tidy } from './view';

/** How close the picture is cut: its tag, the look keys in frame and the state keys in frame (`holds` = what they hold). */
export interface Frame {
  tag: string;
  keys: readonly string[] | 'all';
  states: readonly string[] | 'all';
}

const CLOSE = /\b(?:up close|close-up|close)\b/i;
const ONLY = /\bonly\b/i;
const near = (part: RegExp) => (b: string) => part.test(b) && CLOSE.test(b);

/** Looks a crop can show. [provisional] */
const FEET = ['species', 'skin', 'scales', 'palette', 'claws'];
const FACE = ['species', 'eyes', 'horns', 'hair', 'face', 'marks'];
const LOWER = ['species', 'skin', 'scales', 'palette', 'build'];

/** Framing words in a brief and the frame they ask for; the first row that matches wins. [provisional] */
const FRAMES: readonly (readonly [(brief: string) => boolean, Frame])[] = [
  [(b) => /\bonly (?:(?:his|her|their|its) )?(?:feet|paws|soles)\b|\b(?:feet|paws|soles) only\b/i.test(b), { tag: 'feet only', keys: FEET, states: [] }],
  [near(/\b(?:feet|foot|soles?|paws?)\b/i), { tag: 'foot focus', keys: FEET, states: [] }],
  [(b) => /\bportrait\b|\bonly (?:(?:his|her|their|its) )?face\b/i.test(b) || near(/\b(?:face|head)\b/i)(b), { tag: 'portrait', keys: FACE, states: ['mood'] }],
  [(b) => /\b(?:groin|crotch)\b/i.test(b), { tag: 'close-up, lower body', keys: LOWER, states: 'all' }],
  [(b) => CLOSE.test(b), { tag: 'close-up', keys: 'all', states: 'all' }],
];

/** The frame a brief asks for, and the brief without "only" or the close-up phrase; the part named stays (it is what the brief is about). */
export function frameOf(brief: string): (Frame & { brief: string }) | undefined {
  const frame = FRAMES.find(([match]) => match(brief))?.[1];
  if (!frame) return undefined;
  const rest = brief.replace(new RegExp(ONLY.source, 'gi'), ' ').replace(new RegExp(CLOSE.source, 'gi'), ' ');
  return { ...frame, brief: tidy(rest) };
}

/** Only the entries of `record` in frame. */
export const inFrame = (record: Readonly<Record<string, string>>, keys: Frame['keys']): Record<string, string> =>
  keys === 'all' ? { ...record } : Object.fromEntries(Object.entries(record).filter(([k]) => keys.includes(k)));
