import type { Adventure, StoryCard, TemplateId } from '../model/types';
import { newId } from '../model/types';
import { LooseCardJson } from '../schema/card';
import { CARD_SYSTEM, cardPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';
import { collect, type Provider } from '../ports/provider';

/**
 * AI story card generation (AI Dungeon's "Generate New" buttons).
 *
 * Uses JSON-schema constrained output when the backend supports it
 * (llama-server `json_schema`), otherwise falls back to prompting for JSON
 * and extracting the first well-formed object from the reply. Either way the
 * result is validated and normalised before it becomes a StoryCard.
 */

/**
 * speedCreate: Finish becomes Next (save, then a new blank card of the same type).
 * includeSummary: give the generator the Story Summary as context.
 * logToNotes: append every generation (and retry) to the card's Notes.
 * aiInstructions: style/content guidance. storyInformation: key world facts.
 */
export type CardGeneratorSettings = NonNullable<Adventure['cardGenerator']>;

export const DEFAULT_GENERATOR_SETTINGS: CardGeneratorSettings = {
  speedCreate: false,
  includeSummary: true,
  logToNotes: false,
  aiInstructions: '',
  storyInformation: '',
};

export interface GenerateCardRequest {
  type: string;
  /** When given, only Entry (and triggers) are generated; the name is kept. */
  name?: string | undefined;
  /** Existing entry to improve rather than replace (optional). */
  entry?: string;
  settings: CardGeneratorSettings;
  storySummary?: string | undefined;
}

export interface GeneratedCard {
  name: string;
  entry: string;
  triggers: string[];
  raw: string;
}

export interface GenerateDeps {
  provider: Provider;
  template: TemplateId;
  signal?: AbortSignal;
}

export async function generateStoryCard(req: GenerateCardRequest, deps: GenerateDeps): Promise<GeneratedCard> {
  const caps = await deps.provider.capabilities();
  // Schema generation and JSON repair are only needed here; keep them out of the start-up bundle.
  const [{ CARD_JSON_SCHEMA }, { jsonrepair }] = await Promise.all([import('./cardJsonSchema'), import('jsonrepair')]);
  const user = cardPrompt({
    type: req.type,
    name: req.name,
    instructions: req.settings.aiInstructions || undefined,
    storyInfo: req.settings.storyInformation || undefined,
    summary: req.settings.includeSummary ? req.storySummary : undefined,
  });
  const rendered = renderTemplate(deps.template, CARD_SYSTEM, user, caps.jsonSchema ? '' : '{');
  const { text } = await collect(
    deps.provider.complete(
      {
        prompt: rendered.prompt,
        maxTokens: 320,
        temperature: 0.9,
        topP: 0.95,
        stop: rendered.stop,
        cachePrompt: false,
        slotId: 1,
        jsonSchema: caps.jsonSchema ? CARD_JSON_SCHEMA : undefined,
      },
      deps.signal,
    ),
  );
  const raw = caps.jsonSchema ? text : `{${text}`;
  // Output cut off at maxTokens is common.
  const parsed = parseCardJson(raw, jsonrepair);
  if (!parsed) throw new Error('The model did not return a usable card. Try again or adjust the generator instructions.');
  const name = (req.name?.trim() || parsed.name || req.type).trim();
  const triggers = normaliseTriggers(parsed.triggers, name);
  return { name, entry: parsed.entry.trim(), triggers, raw };
}

/** Extract `{name, entry, triggers}` from model output, tolerating prose, fences and (with `repair`) broken JSON. */
export function parseCardJson(text: string, repair: (json: string) => string = (j) => j): { name: string; entry: string; triggers: string[] } | null {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const candidates = [trimmed, fence, first >= 0 ? trimmed.slice(first, last > first ? last + 1 : undefined) : undefined];
  for (const c of candidates) {
    if (!c) continue;
    let data: unknown;
    try {
      data = JSON.parse(repair(c));
    } catch {
      continue; // not JSON even after repair; try the next candidate
    }
    const card = LooseCardJson.safeParse(data);
    if (!card.success) continue;
    const { name, title, entry, description, triggers, keys } = card.data;
    const body = entry ?? description ?? '';
    if (!body.trim()) continue;
    const raw = triggers ?? keys ?? [];
    return {
      name: name ?? title ?? '',
      entry: body,
      triggers: typeof raw === 'string' ? raw.split(',') : raw.filter((t): t is string => typeof t === 'string'),
    };
  }
  return null;
}

/** Lower-case, trim, dedupe, drop empties/very short triggers, and always include the name. */
export function normaliseTriggers(triggers: string[], name: string): string[] {
  const out = new Set<string>();
  const add = (t: string) => {
    const s = t.trim().toLowerCase();
    if (s.length >= 3) out.add(s);
  };
  if (name) {
    const n = name.trim();
    if (n) out.add(n);
    // Also the first word of multi-word names ("Merav" from "Merav the rider"), unless it is very common.
    const firstWord = n.split(/\s+/)[0] ?? '';
    if (firstWord.length >= 3 && !/^(the|a|an|of)$/i.test(firstWord)) out.add(firstWord);
  }
  for (const t of triggers) add(t);
  return [...out].slice(0, 8);
}

export function toStoryCard(g: GeneratedCard, type: string, notes?: string): StoryCard {
  return { id: newId('card_'), type, name: g.name, entry: g.entry, triggers: g.triggers, notes };
}
