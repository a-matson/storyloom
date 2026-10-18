import { describe, expect, it } from 'vitest';
import { draftOf, nextRound, saveDraft } from '@app/session/builder';
import { lineEdits } from '@app/session/lines';
import { mergeEntity } from '@core/memory/entities';
import { lastActive } from '@core/context/spotlight';
import { indexAssertions } from '@core/memory/assertionIndex';
import { appearanceOf, currentStates, isLook, setValue } from '@core/memory/looks';
import { isComplete, nextQuestions } from '@core/memory/sheet';
import { createBlankAdventure, type Assertion } from '@core/model';
import { setup } from './fixtures/session';

const fox = mergeEntity(undefined, { name: 'Vex', kind: 'character', description: '' }, 0);
const answered = (values: Record<string, string>): Assertion[] => Object.entries(values).reduce<Assertion[]>((own, [k, v]) => setValue(fox, own, k, v, 1), []);

describe('nextQuestions', () => {
  it('asks missing required keys first, in SHEET_KEYS order', () => {
    expect(nextQuestions([], [])).toEqual(['species', 'build', 'skin']);
    expect(nextQuestions(answered({ species: 'fox', build: 'tall and wiry' }), ['skin', 'body'])).toEqual(['eyes', 'hair', 'face']);
  });

  it('asks body in round one for a non-human species', () => {
    expect(nextQuestions(answered({ species: 'dragon' }), [])).toEqual(['body', 'build', 'skin']);
  });

  it('does not ask it for a human', () => {
    expect(nextQuestions(answered({ species: 'human' }), [])).toEqual(['build', 'skin', 'eyes']);
  });

  it('asks a vague key after every missing one, and never a skipped one', () => {
    const own = answered({ species: 'fox', build: 'lean', skin: 'red fur', eyes: 'amber', hair: 'brown', face: 'a scar', wearing: 'a cloak' });
    expect(nextQuestions(own, ['horns', 'scales', 'body'], 6)).toEqual(['marks', 'accessories', 'palette', 'hair', 'wearing']);
  });

  it('is complete when every required key is answered (vague counts) or skipped', () => {
    const own = answered({ species: 'fox', build: 'lean', skin: 'red fur', eyes: 'amber', hair: 'brown' });
    expect(isComplete(own, ['face'])).toBe(false);
    expect(isComplete(own, ['face', 'wearing'])).toBe(true);
  });
});

describe('appearanceOf with builder keys', () => {
  it('writes the new keys in SHEET_KEYS order', () => {
    const own = answered({ palette: 'blue and silver', wearing: 'a cloak', skin: 'red fur', species: 'fox', face: 'a long muzzle' });
    expect(appearanceOf(own)).toBe('species: fox, skin: red fur, face: a long muzzle, wearing: a cloak, palette: blue and silver');
  });

  it('gives an old save with only LOOK_KEYS the same string as before', () => {
    const own = answered({ wearing: 'a red cloak', marks: 'a scar', hair: 'white mohawk', eyes: 'green', build: 'tall', species: 'elf' });
    expect(appearanceOf(own)).toBe('species: elf, build: tall, eyes: green, hair: white mohawk, marks: a scar, wearing: a red cloak');
  });

  it('writes body after species, and nothing for it when unset (portrait hashes hold)', () => {
    expect(appearanceOf(answered({ build: 'massive', species: 'dragon', body: 'quadruped' }))).toBe('species: dragon, body: quadruped, build: massive');
    expect(appearanceOf(answered({ build: 'massive', species: 'dragon' }))).toBe('species: dragon, build: massive');
  });

  it('keeps wearing as a state, accessories and skin as looks', () => {
    const kinds = Object.fromEntries(
      answered({ wearing: 'a cloak', accessories: 'a staff', skin: 'red fur' }).map((a) => [a.kind === 'look' || a.kind === 'state' ? a.key : '', a.kind]),
    );
    expect(kinds).toEqual({ wearing: 'state', accessories: 'look', skin: 'look' });
  });

  it('reads an old state row keyed accessories as a look', () => {
    const old: Assertion = {
      id: 'as_old',
      subject: fox.id,
      producer: 'player',
      at: 1,
      basis: 'player',
      since: 1,
      kind: 'state',
      key: 'accessories',
      value: 'a staff',
    };
    expect(isLook('accessories')).toBe(true);
    expect(appearanceOf([old])).toBe('accessories: a staff');
    expect(lastActive(fox, [], indexAssertions([old]))).toBe(-1);
  });
});

describe('builder', () => {
  it('writes an answer as the player’s value, ending the old one', () => {
    const adv = createBlankAdventure('Test', 'You stand at the gate.');
    adv.entities = [fox];
    const { session } = setup({ adventure: adv });
    const edits = lineEdits(session);
    edits.setValue(fox.id, 'hair', 'brown');
    edits.setValue(fox.id, 'hair', 'brown braids');
    const hair = session.adv.assertions.filter((a) => a.subject === fox.id && a.kind === 'look' && a.key === 'hair');
    expect(hair.map((a) => [a.basis, a.until])).toEqual([
      ['player', 1],
      ['player', undefined],
    ]);
    expect(currentStates(hair)).toEqual({ hair: 'brown braids' });
  });

  it('keeps a draft’s skips across reopening and asks the next round from the answers', () => {
    const adv = createBlankAdventure('Test', 'You stand at the gate.');
    adv.entities = [fox];
    const { session } = setup({ adventure: adv });
    const first = draftOf(session, fox.id);
    expect(first.asked).toEqual(['species', 'build', 'skin']);
    lineEdits(session).setValue(fox.id, 'species', 'fox');
    saveDraft(fox.id, { ...first, skipped: ['build'] });
    expect(draftOf(session, fox.id).skipped).toEqual(['build']);
    expect(nextRound(session, fox.id, draftOf(session, fox.id))).toMatchObject({ round: 2, asked: ['body', 'skin', 'eyes'] });
  });
});
