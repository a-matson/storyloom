import type { Adventure, Scenario, TemplateId } from '../model/types';
import { collect, type Provider } from '../ports/provider';
import { applyPlaceholders } from '../text/placeholders';
import { OPENING_SYSTEM, openingPrompt } from '../text/prompts';
import { renderTemplate } from '../text/templates';

export interface OpeningRequest {
  /** The scenario prompt with placeholders applied. */
  brief: string;
  picks: { type: string; entry: string }[];
  plotEssentials?: string | undefined;
  /** Scenario AI Instructions; the system prompt when set. */
  aiInstructions?: string | undefined;
}

/** The opening request for a Character Creator adventure just made by `createAdventureFromScenario`. */
export function openingRequest(s: Scenario, adv: Adventure): OpeningRequest {
  const answers = Object.fromEntries(adv.placeholders.map((p) => [p.question, p.answer]));
  return {
    brief: applyPlaceholders(s.prompt, answers).trim(),
    picks: adv.storyCards.filter((c) => c.selectable).map((c) => ({ type: c.type, entry: c.entry })),
    plotEssentials: adv.plot.plotEssentials,
    aiInstructions: adv.plot.aiInstructions,
  };
}

/** AI-written first action (Character Creator, later "Surprise me"). Runs on slot 1, uncached. */
export async function writeOpening(req: OpeningRequest, deps: { provider: Provider; template: TemplateId; signal?: AbortSignal }): Promise<string> {
  const rendered = renderTemplate(deps.template, req.aiInstructions?.trim() || OPENING_SYSTEM, openingPrompt(req));
  const { text } = await collect(
    deps.provider.complete(
      {
        prompt: rendered.prompt,
        maxTokens: 300, // [provisional]
        temperature: 0.9,
        topP: 0.95,
        stop: rendered.stop,
        cachePrompt: false,
        slotId: 1,
      },
      deps.signal,
    ),
  );
  const opening = text.trim();
  if (!opening) throw new Error('The model returned an empty opening.');
  return opening;
}
