import type { Action, Adventure, AdventureSettings, StoryCard } from '@core/types';
import { DEFAULT_ADVENTURE_SETTINGS, newId } from '@core/types';
import { ZipReader } from './zip';

/**
 * Import / export.
 *
 * Our own format: `{ format: 'storyloom-adventure', version: 1, adventure }`.
 *
 * AI Dungeon "Download Adventure" zips: their exact layout is not documented
 * and has changed over time, so `importAidZip` is deliberately tolerant — it
 * looks for any JSON file whose shape resembles an adventure (an `actions`
 * array with `text`/`type`, optional `storyCards`/`worldInfo`, `memory`,
 * `authorsNote`), or a plain text file, and maps what it finds. Anything it
 * cannot map is preserved in `adventure.description` as a note.
 */

export const FORMAT = 'storyloom-adventure';

export interface AdventureExport {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  adventure: Adventure;
}

export function exportAdventure(a: Adventure): AdventureExport {
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), adventure: a };
}

export function exportAdventureJson(a: Adventure): string {
  return JSON.stringify(exportAdventure(a), null, 2);
}

/** Plain-text transcript (what a reader would want). */
export function exportAdventureText(a: Adventure): string {
  return a.actions
    .filter((x) => x.type !== 'see')
    .map((x) => x.versions[x.active] ?? '')
    .join('\n\n');
}

export function importAdventureJson(json: string, settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS): Adventure {
  const data = JSON.parse(json) as unknown;
  if (isOurExport(data)) return renumber(data.adventure);
  // Maybe a bare Adventure object.
  if (isAdventureLike(data)) return renumber(data as Adventure);
  // Maybe an AI Dungeon JSON export.
  const mapped = mapAidJson(data, settings);
  if (mapped) return mapped;
  throw new Error('Unrecognised adventure JSON');
}

function isOurExport(d: unknown): d is AdventureExport {
  return !!d && typeof d === 'object' && (d as AdventureExport).format === FORMAT && !!(d as AdventureExport).adventure;
}

function isAdventureLike(d: unknown): boolean {
  const a = d as Partial<Adventure>;
  return !!a && Array.isArray(a.actions) && !!a.plot && Array.isArray(a.storyCards) && !!a.settings && typeof a.title === 'string';
}

/** Give imported records fresh ids so an import never overwrites an existing adventure. */
function renumber(a: Adventure): Adventure {
  const now = Date.now();
  return {
    ...a,
    id: newId('adv_'),
    actions: a.actions.map((x) => ({ ...x, id: newId('act_') })),
    storyCards: a.storyCards.map((c) => ({ ...c, id: newId('card_') })),
    memories: [], // embeddings may be from another embedder; rebuild lazily
    createdAt: a.createdAt ?? now,
    updatedAt: now,
  };
}

// ---- AI Dungeon mapping ---------------------------------------------------

interface AidAction {
  text?: string;
  type?: string;
  createdAt?: string;
}
interface AidCard {
  keys?: string;
  entry?: string;
  type?: string;
  title?: string;
  name?: string;
  description?: string;
}
interface AidAdventure {
  title?: string;
  description?: string;
  actions?: AidAction[];
  storyCards?: AidCard[];
  worldInfo?: AidCard[];
  memory?: string;
  authorsNote?: string;
  storySummary?: string;
  instructions?: string;
  tags?: string[];
}

function mapAidType(t: string | undefined): Action['type'] {
  switch ((t ?? '').toLowerCase()) {
    case 'do':
      return 'do';
    case 'say':
      return 'say';
    case 'story':
      return 'story';
    case 'see':
      return 'see';
    case 'start':
      return 'start';
    default:
      return 'continue';
  }
}

function mapAidCards(cards: AidCard[] | undefined): StoryCard[] {
  return (cards ?? [])
    .filter((c) => c && (c.entry || c.description))
    .map((c) => ({
      id: newId('card_'),
      type: c.type || 'Custom',
      name: c.title ?? c.name ?? (c.keys ?? '').split(',')[0] ?? 'Card',
      entry: c.entry ?? c.description ?? '',
      triggers: (c.keys ?? '').split(',').filter((k) => k.length > 0),
    }));
}

export function mapAidJson(data: unknown, settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS): Adventure | null {
  const d = data as AidAdventure;
  if (!d || typeof d !== 'object' || !Array.isArray(d.actions)) return null;
  const now = Date.now();
  const actions: Action[] = d.actions
    .filter((x) => x && typeof x.text === 'string')
    .map((x, i) => ({
      id: newId('act_'),
      type: i === 0 ? 'start' : mapAidType(x.type),
      versions: [x.text ?? ''],
      active: 0,
      createdAt: x.createdAt ? Date.parse(x.createdAt) || now : now,
    }));
  return {
    id: newId('adv_'),
    title: d.title ?? 'Imported adventure',
    description: d.description ?? '',
    tags: d.tags ?? [],
    actions,
    plot: {
      aiInstructions: d.instructions,
      plotEssentials: d.memory,
      authorsNote: d.authorsNote,
      storySummary: d.storySummary,
    },
    storyCards: mapAidCards(d.storyCards ?? d.worldInfo),
    memories: [],
    scriptState: {},
    placeholders: [],
    settings: structuredClone(settings),
    createdAt: now,
    updatedAt: now,
  };
}

/** Import an AI Dungeon "Download Adventure" zip (or any zip holding an adventure JSON / text). */
export async function importAidZip(buffer: ArrayBuffer, settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS): Promise<Adventure> {
  const zip = new ZipReader(buffer);
  const jsonEntries = zip.entries.filter((e) => !e.isDirectory && /\.json$/i.test(e.name));
  for (const e of jsonEntries) {
    try {
      const data = JSON.parse(await zip.readText(e)) as unknown;
      if (isOurExport(data)) return renumber(data.adventure);
      if (isAdventureLike(data)) return renumber(data as Adventure);
      const mapped = mapAidJson(data, settings);
      if (mapped) return mapped;
      // Some exports wrap the adventure: { adventure: {...} } or an array.
      const inner = (data as { adventure?: unknown }).adventure ?? (Array.isArray(data) ? data[0] : undefined);
      const mappedInner = inner ? mapAidJson(inner, settings) : null;
      if (mappedInner) return mappedInner;
    } catch {
      // try the next file
    }
  }
  const textEntry = zip.entries.find((e) => !e.isDirectory && /\.(txt|md)$/i.test(e.name));
  if (textEntry) {
    const text = (await zip.readText(textEntry)).trim();
    const now = Date.now();
    const paragraphs = text.split(/\n{2,}/).filter(Boolean);
    return {
      id: newId('adv_'),
      title: textEntry.name.replace(/\.(txt|md)$/i, '').split('/').pop() ?? 'Imported adventure',
      description: 'Imported from a text export; actions were split on blank lines.',
      tags: [],
      actions: paragraphs.map((p, i) => ({
        id: newId('act_'),
        type: i === 0 ? 'start' : p.startsWith('>') ? 'do' : 'continue',
        versions: [p],
        active: 0,
        createdAt: now,
      })),
      plot: {},
      storyCards: [],
      memories: [],
      scriptState: {},
      placeholders: [],
      settings: structuredClone(settings),
      createdAt: now,
      updatedAt: now,
    };
  }
  throw new Error(`No adventure found in zip (${zip.entries.length} entries: ${zip.entries.slice(0, 5).map((e) => e.name).join(', ')}…)`);
}

/** Story cards alone (AI Dungeon's card export is a JSON array of {keys, entry, type, title}). */
export function exportStoryCardsJson(cards: StoryCard[]): string {
  return JSON.stringify(
    cards.map((c) => ({ keys: c.triggers.join(','), entry: c.entry, type: c.type, title: c.name, description: c.notes ?? '' })),
    null,
    2,
  );
}

export function importStoryCardsJson(json: string): StoryCard[] {
  const data = JSON.parse(json) as unknown;
  if (!Array.isArray(data)) throw new Error('Story card import expects a JSON array');
  return mapAidCards(data as AidCard[]);
}
