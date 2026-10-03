import type { Action, Adventure, TemplateId } from '../model/types';
import { LooseCardJson } from '../schema/card';
import { actionStoryText } from '../text/formatting';
import { CARD_SYSTEM, cardPrompt } from '../text/prompts';
import { normaliseTriggers } from './storyCards';
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
  plotEssentials?: string | undefined;
  /** See `recentStory`; the card's subject and triggers are taken from it. */
  recentStory?: string | undefined;
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
    plotEssentials: req.plotEssentials,
    recentStory: req.recentStory,
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
  const entry = parsed.entry.trim();
  const triggers = normaliseTriggers(parsed.triggers, name, { story: req.recentStory ?? '', entry });
  return { name, entry, triggers, raw };
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

/** Story the generator reads, about 600 tokens. [provisional] */
const RECENT_STORY_CHARS = 2400;

/** The tail of the story, newest last, starting on a word. */
export function recentStory(actions: Action[], maxChars = RECENT_STORY_CHARS): string {
  const parts: string[] = [];
  let length = 0;
  for (const a of actions.toReversed()) {
    if (length >= maxChars) break;
    const t = actionStoryText(a);
    if (!t) continue;
    parts.unshift(t);
    length += t.length + 2;
  }
  const text = parts.join('\n\n');
  return text.length <= maxChars ? text : text.slice(text.length - maxChars).replace(/^\S*\s+/, '');
}
