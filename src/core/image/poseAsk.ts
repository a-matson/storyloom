import type { Action, TemplateId } from '../model/types';
import { collect, type Provider } from '../ports/provider';
import { withContent } from '../text/content';
import { actionStoryText } from '../text/formatting';
import { renderTemplate } from '../text/templates';
import { trackJob } from '../trace';
import { CAST_CAP, lookFor, unnamed } from './compose';

/**
 * A named See also reads the last passage, for what the brief leaves out: how the cast lies, moves and looks at the
 * camera. Looks, place and style stay with the composer; the helper is asked for pose tags only.
 */

/** At most 12 tags of up to 4 words, 64 tokens, temperature 0.4. [provisional] */
export const POSE_TAGS = 12;

const POSE_SYSTEM = 'You read a passage of an interactive story and name what a picture of it shows. Reply with comma-separated tags and nothing else.';

/** One original example, so the reply is tags rather than a sentence. [provisional] */
const POSE_EXAMPLE = 'Example (from a different story):\nkneeling, reaching out, worried frown, looking up, from below\n\n';

const POSE_GRAMMAR = `root ::= tag ("," tag){0,${POSE_TAGS - 1}}\ntag ::= " "? word (" " word){0,3}\nword ::= [a-z-]+\n`;

type Cast = Parameters<typeof lookFor>[0] & { states?: Readonly<Record<string, string>> };

export interface PoseAskInput {
  brief: string;
  actions: readonly Action[];
  /** The characters the brief names, and every entity whose name may appear (all become nouns). */
  cast: readonly Cast[];
  entities: Parameters<typeof unnamed>[1];
}

/** The last AI output: what the picture is of. */
const lastPassage = (actions: readonly Action[]) => {
  const a = actions.findLast((x) => x.type === 'continue' || x.type === 'start');
  return a ? actionStoryText(a) : '';
};

const castLine = (e: Cast) => {
  const state = Object.values(e.states ?? {}).join(', ');
  return `- ${lookFor(e)}${state ? `; state: ${state}` : ''}`;
};

/** The ask leads and the passage follows (the helper-prompt rule); names become the nouns the composer sends. */
export function poseAskPrompt({ brief, actions, cast, entities }: PoseAskInput): string {
  const passage = unnamed(lastPassage(actions), entities);
  return (
    `List the pose, action, expression and camera view of the picture the player asks for, as at most ${POSE_TAGS} comma-separated tags. ` +
    'Only what the passage shows; nothing about looks, place or style.\n\n' +
    `The player asks to see: ${unnamed(brief, entities)}\n\n` +
    `Characters:\n${cast.slice(0, CAST_CAP).map(castLine).join('\n')}\n\n` +
    (passage ? `Passage:\n---\n${passage}\n---\n\n` : '') +
    POSE_EXAMPLE +
    'Tags:'
  );
}

export interface PoseDeps {
  provider: Provider;
  template: TemplateId;
  content?: string | undefined;
  signal?: AbortSignal | undefined;
}

/** Lowercase tags of up to 4 words, at most `POSE_TAGS`; what the grammar holds a reply to when the backend has none. */
export const poseTagsOf = (text: string): string[] =>
  (text.split('\n').find((l) => l.trim() !== '') ?? '')
    .toLowerCase()
    .split(',')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => /^[a-z][a-z -]*$/.test(t) && t.split(' ').length <= 4)
    .slice(0, POSE_TAGS);

/** One slot-1 call; a failure costs only the pose (the See still goes), and is logged. */
export async function poseTags(input: PoseAskInput, deps: PoseDeps): Promise<string[]> {
  const rendered = renderTemplate(deps.template, withContent(POSE_SYSTEM, deps.content), poseAskPrompt(input));
  try {
    const grammar = (await deps.provider.capabilities()).grammar ? POSE_GRAMMAR : undefined;
    const { text } = await trackJob('image', () =>
      collect(
        deps.provider.complete(
          { prompt: rendered.prompt, maxTokens: 64, temperature: 0.4, topP: 0.9, stop: [...rendered.stop, '\n'], cachePrompt: false, slotId: 1, grammar },
          deps.signal,
        ),
      ),
    );
    return poseTagsOf(text);
  } catch (e) {
    if (deps.signal?.aborted) throw e;
    console.warn('See pose read failed; composing the brief alone', e);
    return [];
  }
}
