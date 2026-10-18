import { describe, expect, it } from 'vitest';
import { seePrompt, type SeeRequest } from '@core/image/autoPrompt';
import { budgetFor, composeSeePrompt } from '@core/image/compose';
import { poseAskPrompt, poseTagsOf } from '@core/image/poseAsk';
import type { Action, Entity } from '@core/model';
import type { CompletionRequest, Provider } from '@core/ports';
import { renderTemplate } from '@core/text/templates';

const goldarok: Entity & { states?: Record<string, string> } = {
  id: 'g',
  kind: 'character',
  name: 'Goldarok',
  aliases: [],
  description: 'Goldarok is a golden dragon.',
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
  states: { posture: 'lying down' },
};
const act = (type: Action['type'], text: string): Action => ({ id: text, type, versions: [text], active: 0, createdAt: 0 });
const actions = [
  act('continue', 'Old passage.'),
  act('do', '> You stroke his hind foot.'),
  act('continue', 'Goldarok rolls onto his side, purring.'),
  act('see', ''),
];
const req = (brief: string, readsStory = true): SeeRequest => ({ brief, actions, entities: [goldarok], style: 'oil painting', family: 'sdxl', readsStory });

/** A fake provider answering `reply` (or throwing) and recording each request. */
function fake(reply: string | Error) {
  const calls: CompletionRequest[] = [];
  const provider = {
    id: 'fake',
    capabilities: () => Promise.resolve({ grammar: true, jsonSchema: false }),
    async *complete(r: CompletionRequest) {
      calls.push(r);
      if (reply instanceof Error) throw reply;
      yield { text: reply, done: true };
    },
  } as unknown as Provider;
  return { calls, helper: () => Promise.resolve({ provider, template: 'chatml' as const }) };
}

describe('a named See reads the last passage', () => {
  it('a named brief makes one slot-1 call and its tags follow the brief', async () => {
    const { calls, helper } = fake(' lying on side, eyes half closed, from above');
    const { prompt } = await seePrompt(req('Goldarok purring'), helper);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ slotId: 1, maxTokens: 64, temperature: 0.4, cachePrompt: false });
    expect(calls[0]?.grammar).toContain('root ::=');
    expect(prompt).toContain('a golden dragon purring, lying on side, eyes half closed, from above');
  });

  it('the prompt leads with the ask, reads only the last passage and holds no character name', () => {
    const text = poseAskPrompt({ brief: 'Goldarok purring', actions, cast: [goldarok], entities: [goldarok] });
    expect(text).toMatch(/^List the pose, action, expression and camera view/);
    expect(text).toContain('a golden dragon rolls onto his side');
    expect(text).toContain('state: lying down');
    expect(text).not.toContain('Old passage');
    expect(text).not.toContain('Goldarok');
  });

  it('a failed or empty reply composes the brief alone', async () => {
    const alone = composeSeePrompt(req('Goldarok purring')).prompt;
    for (const reply of [new Error('down'), '', 'He Is Purring Loudly At You Now.'])
      expect((await seePrompt(req('Goldarok purring'), fake(reply).helper)).prompt).toBe(alone);
  });

  it('/plain, or a brief naming nobody, composes byte-identically to the old path', async () => {
    const { calls, helper } = fake('lying on side');
    for (const r of [req('Goldarok purring', false), req('a quiet cave')])
      expect(await seePrompt(r, helper)).toEqual({ prompt: composeSeePrompt(r).prompt, entityIds: composeSeePrompt(r).entityIds });
    expect(calls).toHaveLength(0);
    expect(composeSeePrompt(req('Goldarok purring')).prompt).toBe('solo, a golden dragon, lying down, a golden dragon purring, oil painting');
  });

  it('dedupes a tag the brief already has', async () => {
    const { prompt } = await seePrompt(req('Goldarok, purring'), fake('Purring, from above').helper);
    expect(prompt.match(/purring/gi)).toHaveLength(1);
    expect(prompt).toContain('from above');
  });

  it('keeps tags of up to four words, at most twelve', () => {
    expect(poseTagsOf('lying, a b c d e, Tail Up, 3 legs\nmore')).toEqual(['lying', 'tail up']);
    expect(poseTagsOf('abcdefghijklmnopqrst'.split('').join(','))).toHaveLength(12);
  });

  it('story tags drop first over budget', () => {
    const r = req('Goldarok purring');
    const pad = 'x'.repeat(budgetFor('sdxl') - composeSeePrompt(r).prompt.length - 3);
    const prompt = composeSeePrompt({ ...r, storyTags: [pad, 'from above'] }).prompt;
    expect(prompt).toBe(composeSeePrompt(r).prompt);
  });

  it('renders the raw pose-ask prompt', () => {
    const user = poseAskPrompt({ brief: 'Goldarok purring', actions, cast: [goldarok], entities: [goldarok] });
    expect(renderTemplate('chatml', 'sys', user).prompt).toContain('<|im_start|>user\nList the pose');
  });
});
