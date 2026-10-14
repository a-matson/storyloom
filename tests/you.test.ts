import { describe, expect, it } from 'vitest';
import { buildContext } from '@core/context';
import { byPlayer } from '@core/memory/looks';
import { YOU, youLines } from '@core/memory/you';
import type { Action } from '@core/model/types';

const actions: Action[] = [{ id: 'a1', type: 'start', versions: ['Go.'], active: 0, createdAt: 1 }];
const build = (plot: Parameters<typeof buildContext>[0]['plot'], assertions: Parameters<typeof youLines>[0] = []) =>
  buildContext({
    actions,
    plot,
    storyCards: [],
    entities: [],
    assertions,
    rankedMemories: [],
    settings: { contextLength: 400, memoryBankEnabled: true, cacheStableLayout: false, evictionChunk: 8 },
    tokenizer: { count: (t) => Math.ceil(t.length / 4) },
  });

const mine = byPlayer(YOU, 0, { kind: 'trait', text: 'a noodle-shop owner.' });
const look = byPlayer(YOU, 0, { kind: 'look', key: 'hair', value: 'short and grey' });
const guess = { ...byPlayer(YOU, 0, { kind: 'trait', text: 'tall' }), producer: 'turn' as const };
const ended = { ...byPlayer(YOU, 0, { kind: 'trait', text: 'a sailor' }), until: 1 };

describe('the you record', () => {
  it("lists only the player's current lines about themselves", () => {
    expect(youLines([mine, look, guess, ended, byPlayer('ent_x', 0, { kind: 'trait', text: 'other' })])).toEqual([
      'a noodle-shop owner.',
      'hair: short and grey',
    ]);
  });

  it('ends the instructions with the pronouns and own lines, and adds nothing without them', () => {
    expect(build({ aiInstructions: 'Narrate.' }, [guess]).system).toBe('Narrate.');
    const r = build({ aiInstructions: 'Narrate.', you: { pronouns: 'she/her' }, thirdPerson: { enabled: false, name: 'Mira' } }, [mine, guess]);
    expect(r.system).toBe('Narrate.\nThe player ("you") uses she/her pronouns. About the player: a noodle-shop owner.');
    expect(r.sections.find((s) => s.kind === 'instructions')?.cacheable).toBe(true);
    expect(build({ you: { pronouns: 'he/him' }, thirdPerson: { enabled: true, name: 'Bram' } }).system).toBe('The player (Bram) uses he/him pronouns.');
  });
});
