import { recentStory } from '../cards/cardGenerator';
import type { Action, Entity, Scene, TemplateId } from '../model/types';
import { collect, type Provider } from '../ports/provider';
import { withContent } from '../text/content';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { type Block, CAST_CAP, composeSeePrompt, isImplicit, lookFor, namedCast, namedIn, subjectsIn } from './compose';
import { poseTags } from './poseAsk';
import type { SheetFamily } from './sheet';

export { composeSeePrompt, looksOf } from './compose';

/**
 * See prompts: a brief is composed into the sent prompt, and a blank or implicit one ("she turns
 * to face me") goes to the helper model first. The prompt text lives here rather than in
 * `text/prompts.ts` because that module is on the start-up path, and this file is loaded on a See.
 */

/** AI Dungeon's See prompts are short tag lines, not prose. [AID-doc] */
export const IMAGE_PROMPT_CHARS = 400;

export const IMAGE_PROMPT_SYSTEM =
  'You turn a passage of an interactive story into a prompt for an image generator. Reply with one line of comma-separated visual tags and nothing else. ' +
  'Name nudity, blood, wounds and violence plainly as tags when the passage shows them; no euphemisms.';

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
  /** The content clause appended to the system prompt. */
  content?: string | undefined;
  signal?: AbortSignal | undefined;
}

type AutoRequest = Omit<ImagePromptInput, 'recentStory'> & { actions: Action[] };

export async function autoImagePrompt(req: AutoRequest, deps: ImagePromptDeps): Promise<string> {
  const user = imagePromptPrompt({ ...req, recentStory: recentStory(req.actions) });
  const rendered = renderTemplate(deps.template, withContent(IMAGE_PROMPT_SYSTEM, deps.content), user);
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
  entities: readonly (Entity & { looks?: Readonly<Record<string, string>> })[];
  style: string;
  family: SheetFamily;
  /** A brief that names someone also reads the last passage for pose and view (`poseTags`); off, today's path. */
  readsStory?: boolean | undefined;
  omit?: ReadonlySet<Block> | undefined;
}

const pick = ({ prompt, entityIds, seed }: ReturnType<typeof composeSeePrompt>) => ({ prompt, entityIds, ...(seed !== undefined && { seed }) });

/** The prompt to send for a brief and the characters it shows; the helper is asked only for a blank or implicit brief. */
export async function seePrompt(req: SeeRequest, helper: () => Promise<ImagePromptDeps>): Promise<{ prompt: string; entityIds: string[]; seed?: number }> {
  if (req.brief !== '' && !isImplicit(req.brief, namedIn(req.brief, req.entities))) {
    const cast = namedCast(req.brief, req.entities);
    if (!req.readsStory || cast.length === 0) return pick(composeSeePrompt(req));
    const storyTags = await poseTags({ brief: req.brief, actions: req.actions, cast, entities: req.entities }, await helper());
    return pick(composeSeePrompt({ ...req, storyTags }));
  }
  const cast = subjectsIn(req.brief, req.scene, req.entities).slice(0, CAST_CAP);
  const line = await autoImagePrompt({ ...req, cast: cast.map((e) => ({ name: e.name, looks: lookFor(e) })) }, await helper());
  // No scene: the helper already placed it. The line is the story block; the subject block still comes from the cast.
  const named = namedCast(req.brief, req.entities);
  return pick(composeSeePrompt({ brief: line, entities: req.entities, style: req.style, family: req.family, cast, named, omit: req.omit }));
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
