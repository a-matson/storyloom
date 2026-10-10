import { recentStory } from '../cards/cardGenerator';
import type { Action, Entity, Scene, TemplateId } from '../model/types';
import { collect, type Provider } from '../ports/provider';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { CAST_CAP, castIn, composeSeePrompt, isImplicit, looksOf, namedCast } from './compose';

/**
 * See prompts: a brief is composed into the sent prompt, and a blank or implicit one ("she turns
 * to face me") goes to the helper model first. The prompt text lives here rather than in
 * `text/prompts.ts` because that module is on the start-up path, and this file is loaded on a See.
 */

/** AI Dungeon's See prompts are short tag lines, not prose. [AID-doc] */
export const IMAGE_PROMPT_CHARS = 400;

export const IMAGE_PROMPT_SYSTEM =
  'You turn a passage of an interactive story into a prompt for an image generator. Reply with one line of comma-separated visual tags and nothing else.';

/** One original example, so the model answers with tags rather than a sentence. [provisional] */
const IMAGE_PROMPT_EXAMPLE =
  'Example (from a different story):\nferry deck at dusk, ferrywoman in a patched cloak poling through reeds, lantern on a pole, wide river, low mist\n\n';

export interface ImagePromptInput {
  recentStory: string;
  plotEssentials?: string | undefined;
  /** What the player asked to see, when it needs the story to resolve ("she turns to face me"). */
  brief?: string | undefined;
  /** `name: look` for each character the picture may show. */
  cast?: readonly { name: string; looks: string }[] | undefined;
  scene?: Scene | undefined;
}

export function imagePromptPrompt(opts: ImagePromptInput): string {
  const scene = [opts.scene?.location, opts.scene?.weather].filter(Boolean).join(', ');
  return (
    (opts.plotEssentials ? `Story essentials:\n${opts.plotEssentials}\n\n` : '') +
    (opts.recentStory ? `Recent story:\n---\n${opts.recentStory}\n---\n\n` : '') +
    (scene ? `Scene: ${scene}\n\n` : '') +
    (opts.cast && opts.cast.length > 0
      ? `Characters and how they look:\n${opts.cast.map((c) => `${c.name}: ${c.looks}`).join('\n')}\n` +
        'Replace every character name with the look given for it; never output a name.\n\n'
      : '') +
    (opts.brief
      ? `The player asks to see: ${opts.brief}\n\nWrite an image prompt for that picture`
      : 'Write an image prompt for what the last moment of this story looks like') +
    ': one line of comma-separated tags naming the subject, what it is doing, the place and the time of day. ' +
    'No sentences, no dialogue, no names of people or of things that cannot be seen. ' +
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

type AutoRequest = Omit<ImagePromptInput, 'recentStory'> & { actions: Action[] };

export async function autoImagePrompt(req: AutoRequest, deps: ImagePromptDeps): Promise<string> {
  const user = imagePromptPrompt({ ...req, recentStory: recentStory(req.actions) });
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

export interface SeeRequest {
  brief: string;
  actions: Action[];
  plotEssentials?: string | undefined;
  scene?: Scene | undefined;
  entities: readonly Entity[];
  style: string;
}

/** The prompt to send for a brief and the characters it shows; the helper is asked only for a blank or implicit brief. */
export async function seePrompt(req: SeeRequest, helper: () => Promise<ImagePromptDeps>): Promise<{ prompt: string; entityIds: string[] }> {
  if (req.brief !== '' && !isImplicit(req.brief, namedCast(req.brief, req.entities))) return composeSeePrompt(req);
  const cast = castIn(req.brief, req.scene, req.entities).slice(0, CAST_CAP);
  const line = await autoImagePrompt({ ...req, cast: cast.map((e) => ({ name: e.name, looks: looksOf(e) })) }, await helper());
  // No scene: the helper already placed it. Composing still swaps any name it let slip and adds the style.
  return { prompt: composeSeePrompt({ brief: line, entities: req.entities, style: req.style }).prompt, entityIds: cast.map((e) => e.id) };
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
