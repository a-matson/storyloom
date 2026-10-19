import { describe, expect, it } from 'vitest';
import type { Action, StoryCard } from '@core/model/types';
import { act, actions, buildContext, cast, entity, input, lena, orrin, tamsin } from './fixtures/structured';

const ford = { ...entity('Greyford', 'Greyford is a river town.', []), kind: 'place' as const };
const run = (output: string, last: Action, over: Partial<ReturnType<typeof input>> = {}) =>
  buildContext({ ...input(4000), actions: [...actions.slice(0, -2), act('continue', output), last], entities: [lena, orrin, tamsin, ford], ...over });
const line = (r: ReturnType<typeof buildContext>, name: string) =>
  cast(r)
    ?.split('\n')
    .find((l) => l.startsWith(name));

describe('absent characters send nothing', () => {
  const wait = act('do', '> You wait.');

  it('an absent character named only by the last output gets no line', () => {
    expect(line(run("Tamsin's father once crossed here.", wait), 'Tamsin')).toBeUndefined();
  });

  it("named by the player's do, it gets its identity line", () => {
    expect(line(run('Tamsin left long ago.', act('do', '> You ask about Tamsin.')), 'Tamsin')).toBe('Tamsin (far away).');
  });

  it('an absent place named by the output still gets its line', () => {
    expect(line(run('The road runs to Greyford.', wait), 'Greyford')).toBeDefined();
  });

  it('a present character is unaffected', () => {
    expect(line(run('Lena stirs the fire.', wait), 'Lena')).toMatch(/^Lena \(keeps the mill\)/);
  });

  it('with no scene, an absent character named by the output keeps its line', () => {
    const r = run('Tamsin left long ago.', wait, { plot: { authorsNote: 'AN' } });
    expect(line(r, 'Tamsin')).toBe('Tamsin (far away).');
  });
});

describe('absent character cards are held back', () => {
  const card = (name: string, type: string): StoryCard => ({ id: `c-${name}`, type, name, entry: `${name} card.`, triggers: [name] });
  const cards = [card('Tamsin', 'character'), card('Greyford', 'Location'), card('Mira', 'Character')];
  const sent = (r: ReturnType<typeof buildContext>) => r.triggeredCards.map((m) => m.card.name);
  const wait = act('do', '> You wait.');

  it('a Character card triggered by the output is held back while its character is absent', () => {
    const r = run('Tamsin and Mira sailed to Greyford.', wait, { storyCards: cards });
    expect(sent(r)).toEqual(['Greyford']);
    expect(r.absentCards.map((m) => m.card.name).toSorted()).toEqual(['Mira', 'Tamsin']);
  });

  it("sent while present, or when the player's action triggers it", () => {
    const here = run('Tamsin sails.', wait, { storyCards: cards, plot: { scene: { present: ['Lena', 'Tamsin'] } } });
    expect(sent(here)).toEqual(['Tamsin']);
    expect(sent(run('The river.', act('say', '> You say "Mira?"'), { storyCards: cards }))).toEqual(['Mira']);
  });

  it("the player's own card is never held back", () => {
    const r = run('Mira rows on.', wait, { storyCards: cards, plot: { scene: { present: ['Lena'] }, thirdPerson: { enabled: true, name: 'Mira' } } });
    expect(sent(r)).toEqual(['Mira']);
  });

  it('with no scene, every triggered card is sent', () => {
    expect(sent(run('Tamsin and Mira sailed to Greyford.', wait, { storyCards: cards, plot: {} })).toSorted()).toEqual(['Greyford', 'Mira', 'Tamsin']);
  });
});
