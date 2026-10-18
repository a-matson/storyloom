import { describe, expect, it } from 'vitest';
import { buildContext, type ContextBuildInput } from '@core/context';
import { echoes } from '@core/context/redact';
import { newSecret } from '@core/memory/secrets';
import { derived } from './fixtures/assertions';
import { act, actions, entity, input, lena, orrin } from './fixtures/structured';

// "ferry" is a common word; "keys", "smugglers" and "barge" are not.
const told = '> You sold the barge keys to the smugglers. Then you wink.';
const gist = 'You sold the barge keys to the smugglers.';
const story = [...actions.slice(0, 3), act('do', told), ...actions.slice(4)];
const memory = {
  id: 'm',
  text: 'Lena laughed. You admitted the smugglers got the barge keys.',
  fromAction: 3,
  toAction: 6,
  actionIds: [],
  useCount: 0,
  createdAt: 0,
};

const build = (knownBy: string[], over: Partial<ContextBuildInput> = {}) => {
  const i = derived({ ...input(4000), actions: story, ...over });
  return buildContext({ ...i, assertions: [...i.assertions, { ...newSecret(3, gist, knownBy, told), id: 's1' }] });
};
const text = (r: ReturnType<typeof buildContext>, kind: string) => r.sections.find((s) => s.kind === kind)?.text ?? '';

describe('secret redaction', () => {
  it('changes nothing when everyone in the cast knows', () => {
    for (const stable of [false, true]) {
      const settings = { ...input(4000, stable).settings };
      const r = build(['e-Lena', 'e-Orrin'], { settings });
      const plain = buildContext(derived({ ...input(4000, stable), actions: story }));
      expect(r.redactions).toEqual([]);
      expect(r.sections).toEqual(plain.sections);
    }
  });

  it('cuts the marked span for an outsider named only by the player action, and keeps the rest', () => {
    const r = build(['e-Lena']);
    expect(text(r, 'history')).toContain('> […] Then you wink.');
    expect(text(r, 'history')).not.toContain('smugglers');
    expect(r.redactions).toEqual([{ secretId: 's1', section: 'history', text: gist }]);
    const h = r.sections.find((s) => s.kind === 'history');
    expect(h?.tokens).toBe(Math.ceil((h?.text.length ?? 0) / 4));
  });

  it('a knower alone triggers nothing', () => {
    const r = build(['e-Lena'], { actions: [...story.slice(0, -1), act('do', '> You wait.')] });
    expect(r.redactions).toEqual([]);
    expect(text(r, 'history')).toContain(told);
  });

  it('cuts an echo in a memory, drops its mark, and keeps an unrelated sentence', () => {
    const r = build(['e-Lena'], { settings: input(400).settings, rankedMemories: [{ memory, score: 1 }] });
    expect(text(r, 'memories')).toBe('Memories:\nLena laughed. […]');
  });

  it('drops a marked summary sentence', () => {
    const storySummary = 'Long ago: you came to the mill. (known only to you and Lena) You confessed a deal. Recently: rain.';
    const r = build(['e-Lena'], { plot: { ...input(4000).plot, storySummary } });
    expect(text(r, 'storySummary')).toContain('you came to the mill. Recently: rain.');
    expect(r.redactions.map((x) => x.section)).toContain('storySummary');
  });

  it('cuts a cast identity that echoes the gist', () => {
    const smuggler = { ...orrin, description: 'Orrin bought the barge keys from the smugglers.' };
    const r = build(['e-Lena'], { entities: [lena, smuggler] });
    expect(text(r, 'cast')).not.toContain('smugglers');
    expect(r.redactions.some((x) => x.section === 'cast')).toBe(true);
  });

  it('an unrelated character named in the scene is an outsider too', () => {
    const tamsin = entity('Tamsin', 'Tamsin is far away.', []);
    const r = build(['e-Lena', 'e-Orrin'], { entities: [lena, orrin, tamsin], plot: { scene: { present: ['Lena', 'Tamsin'] } } });
    expect(r.redactions[0]?.section).toBe('history');
  });
});

describe('echoes', () => {
  it('needs three shared content words and 40 % of the gist', () => {
    expect(echoes('Orrin wonders who gave the smugglers the barge keys.', gist)).toBe(true);
    expect(echoes('The smugglers took the barge.', gist)).toBe(false);
    expect(echoes('Rain falls on the mill.', gist)).toBe(false);
  });
});
