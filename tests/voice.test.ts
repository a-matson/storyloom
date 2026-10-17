import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { foldEntities, type FoldLog } from '@core/memory/fold';
import { createBlankAdventure } from '@core/model/scenario';
import type { Action, Adventure, Assertion } from '@core/model';
import { Assertion as AssertionSchema } from '@core/schema/assertion';
import { ExtractedEntity, VOICE_CHARS } from '@core/schema/extraction';
import { createApproxTokenizer } from '@core/text/tokenizer';
import { act, cast, input } from './fixtures/structured';
import { derived } from './fixtures/assertions';
import { buildContext as build } from '@core/context';

const TALK = 'Tamsin leans on the oar.\n\n"Mind the rope, love," Tamsin says.';

function story(speakers: Action['speakers']): Adventure {
  const adv = createBlankAdventure('T', '');
  adv.actions = [{ id: 'a0', type: 'continue', versions: [TALK], active: 0, createdAt: 0, ...(speakers && { speakers }) }];
  adv.entities = [mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 0)];
  return adv;
}

function fold(adv: Adventure, voice: string, at = 0): FoldLog {
  const log: FoldLog = { proposed: 0, rejected: [] };
  const passage = `[${at}] ${TALK}`;
  foldEntities(
    adv,
    [{ name: 'Tamsin', kind: 'character', description: '', facts: [], voice }],
    passage,
    { fromAction: 0, toAction: adv.actions.length },
    { log },
  );
  return log;
}
const voices = (adv: Adventure) => adv.assertions.filter((a) => a.kind === 'voice');

describe('the voice fold', () => {
  it('keeps a voice only where a speaker label quotes the character', () => {
    const adv = story([{ paragraph: 1, name: 'Tamsin' }]);
    expect(fold(adv, 'warm, calls you "love"').rejected).toEqual([]);
    expect(voices(adv)).toMatchObject([{ kind: 'voice', text: 'warm, calls you "love"', at: 0, producer: 'turn' }]);
    expect(voices(adv)[0]).not.toHaveProperty('until');
  });

  it('trims a stray comma and the verb the now-line adds', () => {
    const adv = story([{ paragraph: 1, name: 'Tamsin' }]);
    fold(adv, ', speaks in a gravelly voice,');
    expect(voices(adv).map((a) => a.text)).toEqual(['in a gravelly voice']);
  });

  it('drops one with no attributed dialogue, unlabelled actions included', () => {
    for (const speakers of [undefined, []]) {
      const adv = story(speakers);
      expect(fold(adv, 'warm, calls you "love"').rejected).toMatchObject([{ entity: 'Tamsin', reason: 'no-dialogue' }]);
      expect(voices(adv)).toEqual([]);
    }
  });

  it('a new voice ends the old one; a pinned one stays', () => {
    const adv = story([{ paragraph: 1, name: 'Tamsin' }]);
    fold(adv, 'warm, calls you "love"');
    adv.actions.push({ ...adv.actions[0]!, id: 'a1' });
    fold(adv, 'curt and dry', 1);
    expect(voices(adv).map((a) => [a.text, a.until])).toEqual([
      ['warm, calls you "love"', 1],
      ['curt and dry', undefined],
    ]);
    adv.assertions = adv.assertions.map((a) => (a.kind === 'voice' && a.until === undefined ? { ...a, pinned: true } : a));
    fold(adv, 'shouts everything', 1);
    expect(
      voices(adv)
        .filter((a) => a.until === undefined)
        .map((a) => a.text),
    ).toEqual(['curt and dry']);
  });

  it('old records and replies without a voice parse unchanged', () => {
    const old = { id: 'x', subject: 'e', producer: 'batch', at: 0, basis: 'stated', since: 0, kind: 'trait', text: 'She rows.' };
    expect(AssertionSchema.parse(old)).toEqual(old);
    expect(ExtractedEntity.parse({ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', facts: [] })).not.toHaveProperty('voice');
  });
});

describe('speaks: on the now-line', () => {
  const VOICE = 'a'.repeat(VOICE_CHARS - 10) + ' says love';
  const voice: Assertion = { id: 'v1', subject: 'e-Lena', producer: 'batch', at: 0, basis: 'stated', since: 0, kind: 'voice', text: VOICE };
  const line = (actions: Action[]) => {
    const i = derived({ ...input(4000), actions });
    return cast(build({ ...i, assertions: [...i.assertions, voice] }))
      ?.split('\n')
      .find((l) => l.startsWith('Lena'));
  };
  const before = input(4000).actions.slice(0, -1);

  it('is sent after the player says something, or when the last output quoted them', () => {
    expect(line([...before, act('say', '> You say "Hello."')])).toContain(`speaks: ${VOICE}`);
    const quoted = { ...act('continue', '"Out," Lena says.'), speakers: [{ paragraph: 0, name: 'Lena' }] };
    expect(line([...before, quoted, act('do', '> You wait.')])).toContain('speaks: ');
  });

  it('is not sent otherwise, nor with no voice', () => {
    expect(line([...before, act('do', '> You wait.')])).not.toContain('speaks:');
    const i = derived({ ...input(4000), actions: [...before, act('say', '> You say "Hi."')] });
    expect(cast(build(i))).not.toContain('speaks:');
  });

  it('costs at most 15 tokens for a full-length voice', () => {
    const full = 'clipped and dry, calls you "friend", sighs a lot, never laughs'.slice(0, VOICE_CHARS);
    expect(full).toHaveLength(VOICE_CHARS);
    expect(createApproxTokenizer().count(`; speaks: ${full}`)).toBeLessThanOrEqual(15);
  });
});
