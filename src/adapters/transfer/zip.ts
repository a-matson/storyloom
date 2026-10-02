import { strFromU8, unzipSync } from 'fflate';
import type { Adventure, AdventureSettings } from '@core/model';
import { newId } from '@core/model';
import { mapAidJson } from './aid';
import { isRecord, parseOwn } from './own';

// Real exports are a few MB; anything bigger is a mistake or a zip bomb.
const MAX_UNZIPPED_BYTES = 64 * 1024 * 1024;

export interface ImportResult {
  adventure: Adventure;
  warnings: string[];
}

function unzip(buffer: ArrayBuffer): Record<string, Uint8Array> {
  let total = 0;
  return unzipSync(new Uint8Array(buffer), {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UNZIPPED_BYTES) throw new Error(`Zip expands past ${MAX_UNZIPPED_BYTES / 1024 / 1024} MB; refusing to import.`);
      return /\.(json|txt|md)$/i.test(f.name);
    },
  });
}

/** Our JSON, a bare adventure, an AID adventure, or one wrapped as `{ adventure }` / `[adventure]`. */
export function adventureFromData(data: unknown, warnings: string[], settings: AdventureSettings): Adventure | undefined {
  const inner = isRecord(data) ? data['adventure'] : Array.isArray(data) ? data[0] : undefined;
  return parseOwn(data) ?? mapAidJson(data, warnings, settings) ?? (inner === undefined ? undefined : mapAidJson(inner, warnings, settings));
}

function fromText(name: string, text: string, settings: AdventureSettings): Adventure {
  const now = Date.now();
  return {
    id: newId('adv_'),
    title:
      name
        .replace(/\.(txt|md)$/i, '')
        .split('/')
        .pop() || 'Imported adventure',
    description: 'Imported from a text export; actions were split on blank lines.',
    tags: [],
    actions: text
      .trim()
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((p, i) => ({ id: newId('act_'), type: i === 0 ? 'start' : p.startsWith('>') ? 'do' : 'continue', versions: [p], active: 0, createdAt: now })),
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

/** An AI Dungeon "Download Adventure" zip, or any zip holding an adventure JSON or a text transcript. */
export function importAidZip(buffer: ArrayBuffer, settings: AdventureSettings): ImportResult {
  const files = unzip(buffer);
  const names = Object.keys(files);
  const warnings: string[] = [];
  for (const name of names.filter((n) => /\.json$/i.test(n))) {
    const bytes = files[name];
    if (!bytes) continue;
    let data: unknown;
    try {
      data = JSON.parse(strFromU8(bytes));
    } catch {
      warnings.push(`Skipped ${name}: not valid JSON.`);
      continue;
    }
    const adventure = adventureFromData(data, warnings, settings);
    if (adventure) return { adventure, warnings };
    warnings.push(`Skipped ${name}: not an adventure.`);
  }
  const text = names.find((n) => /\.(txt|md)$/i.test(n));
  const bytes = text === undefined ? undefined : files[text];
  if (text !== undefined && bytes) return { adventure: fromText(text, strFromU8(bytes), settings), warnings };
  throw new Error(`No adventure found in zip (${names.length} candidate files${names.length ? `: ${names.slice(0, 5).join(', ')}` : ''}).`);
}
