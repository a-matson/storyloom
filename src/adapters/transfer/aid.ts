import { z } from 'zod/mini';
import type { Action, Adventure, AdventureSettings, StoryCard } from '@core/model';
import { DEFAULT_ADVENTURE_SETTINGS, newId } from '@core/model';

/**
 * AI Dungeon exports. Their layout is undocumented and has changed over time, so fields are
 * optional and each card/action is validated on its own: bad entries are skipped and reported.
 */
const str = z.optional(z.string());
const AidAction = z.object({ text: z.string(), type: str, createdAt: str });
export const AidCard = z.object({ keys: str, entry: str, type: str, title: str, name: str, description: str });
const AidAdventure = z.object({
  title: str,
  description: str,
  actions: z.array(z.unknown()),
  storyCards: z.optional(z.array(z.unknown())),
  worldInfo: z.optional(z.array(z.unknown())),
  memory: str,
  authorsNote: str,
  storySummary: str,
  instructions: str,
  tags: z.optional(z.array(z.string())),
});

const ACTION_TYPES: Partial<Record<string, Action['type']>> = { do: 'do', say: 'say', story: 'story', see: 'see', start: 'start' };
const mapType = (t: string | undefined): Action['type'] => ACTION_TYPES[(t ?? '').toLowerCase()] ?? 'continue';

/** Validates each element on its own; returns the good ones and a warning per bad one. */
function each<T>(
  items: readonly unknown[],
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  what: string,
  warnings: string[],
): T[] {
  const ok: T[] = [];
  items.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (r.success) ok.push(r.data);
    else warnings.push(`Skipped ${what} ${i + 1}: unexpected shape.`);
  });
  return ok;
}

export function mapAidCards(items: readonly unknown[], warnings: string[]): StoryCard[] {
  return each(items, AidCard, 'story card', warnings)
    .filter((c) => c.entry || c.description)
    .map((c) => ({
      id: newId('card_'),
      type: c.type || 'Custom',
      name: c.title ?? c.name ?? (c.keys ?? '').split(',')[0] ?? 'Card',
      entry: c.entry ?? c.description ?? '',
      triggers: (c.keys ?? '').split(',').filter((k) => k.length > 0),
    }));
}

/** An AI Dungeon adventure JSON, or undefined when `data` doesn't look like one. */
export function mapAidJson(data: unknown, warnings: string[], settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS): Adventure | undefined {
  const parsed = AidAdventure.safeParse(data);
  if (!parsed.success) return undefined;
  const d = parsed.data;
  const now = Date.now();
  const actions: Action[] = each(d.actions, AidAction, 'action', warnings).map((x, i) => ({
    id: newId('act_'),
    type: i === 0 ? 'start' : mapType(x.type),
    versions: [x.text],
    active: 0,
    createdAt: (x.createdAt && Date.parse(x.createdAt)) || now,
  }));
  return {
    id: newId('adv_'),
    title: d.title ?? 'Imported adventure',
    description: d.description ?? '',
    tags: d.tags ?? [],
    actions,
    plot: { aiInstructions: d.instructions, plotEssentials: d.memory, authorsNote: d.authorsNote, storySummary: d.storySummary },
    storyCards: mapAidCards(d.storyCards ?? d.worldInfo ?? [], warnings),
    memories: [],
    entities: [],
    scriptState: {},
    placeholders: [],
    settings: structuredClone(settings),
    createdAt: now,
    updatedAt: now,
  };
}
