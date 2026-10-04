import { recentStory } from '../cards/cardGenerator';
import type { Action, TemplateId } from '../model/types';
import { collect, type Provider } from '../ports/provider';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';

/**
 * A blank See prompt: the helper model writes one from the story so far.
 * The prompt text lives here rather than in `text/prompts.ts` because that module is on
 * the start-up path, and this whole file is loaded only when a See input is empty.
 */

/** AI Dungeon's See prompts are short tag lines, not prose. [AID-doc] */
export const IMAGE_PROMPT_CHARS = 400;

export const IMAGE_PROMPT_SYSTEM =
  'You turn a passage of an interactive story into a prompt for an image generator. Reply with one line of comma-separated visual tags and nothing else.';

/** One original example, so the model answers with tags rather than a sentence. [provisional] */
const IMAGE_PROMPT_EXAMPLE =
  'Example (from a different story):\nferry deck at dusk, ferrywoman in a patched cloak poling through reeds, ' +
  'lantern on a pole, wide river, low mist, muted colours, painted illustration\n\n';

export function imagePromptPrompt(opts: { recentStory: string; plotEssentials?: string | undefined }): string {
  return (
    (opts.plotEssentials ? `Story essentials:\n${opts.plotEssentials}\n\n` : '') +
    (opts.recentStory ? `Recent story:\n---\n${opts.recentStory}\n---\n\n` : '') +
    'Write an image prompt for what the last moment of this story looks like: one line of comma-separated tags naming ' +
    'the subject, what it is doing, the place, the time of day and the art style. ' +
    'No sentences, no dialogue, no names of things that cannot be seen, nothing the player types. ' +
    `Under ${IMAGE_PROMPT_CHARS} characters.\n\n` +
    IMAGE_PROMPT_EXAMPLE +
    'Prompt:'
  );
}

export interface ImagePromptDeps {
  provider: Provider;
  template: TemplateId;
  signal?: AbortSignal | undefined;
}

export async function autoImagePrompt(req: { actions: Action[]; plotEssentials?: string | undefined }, deps: ImagePromptDeps): Promise<string> {
  const user = imagePromptPrompt({ recentStory: recentStory(req.actions), plotEssentials: req.plotEssentials });
  const rendered = renderTemplate(deps.template, IMAGE_PROMPT_SYSTEM, user);
  const { text } = await trackJob('image', () =>
    collect(
      deps.provider.complete(
        { prompt: rendered.prompt, maxTokens: 160, temperature: 0.7, topP: 0.9, stop: [...rendered.stop, '\n'], cachePrompt: false, slotId: 1 },
        deps.signal,
      ),
    ),
  );
  const line = tagLine(text);
  if (line === '') throw new Error('The model returned no image prompt; describe what you want to see instead.');
  return line;
}

/** First non-empty line, no quotes or label, cut at a comma so a long reply never ends mid-tag. */
export function tagLine(text: string): string {
  const first = text.split('\n').find((l) => l.trim() !== '') ?? '';
  const body = first
    .replace(/["“”]/g, ' ')
    .replace(/^\s*(?:image\s+)?prompt:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (body.length <= IMAGE_PROMPT_CHARS) return body;
  const cut = body.slice(0, IMAGE_PROMPT_CHARS);
  const comma = cut.lastIndexOf(',');
  return (comma > 0 ? cut.slice(0, comma) : cut.replace(/\s+\S*$/, '')).trim();
}
