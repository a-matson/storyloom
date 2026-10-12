import { describe, expect, it } from 'vitest';
import { outputFlag, pastTense } from '@core/text';

const PRESENT = 'You walk to the door. It is locked, and the wind feels cold. You look back; the road is empty and Tamsin waves.';
const PAST = 'You walked to the door. It was locked, and the wind felt cold. You looked back; the road was empty and Tamsin had gone.';

describe('pastTense', () => {
  it('passes present narration', () => expect(pastTense(PRESENT)).toBe(false));
  it('flags past narration', () => expect(pastTense(PAST)).toBe(true));
  it('ignores past tense inside quotes', () =>
    expect(pastTense(`${PRESENT} "I was there, I saw it, I had to run, it was awful," she said “and it was”.`)).toBe(false));
  it('never flags a short reply', () => expect(pastTense('You walked. It was cold.')).toBe(false));
});

describe('outputFlag', () => {
  it('flags a banned phrase case-insensitively, before the tense', () =>
    expect(outputFlag(`${PAST} His voice Thick with fear.`, ['', 'his voice thick'])).toEqual({
      label: 'Uses "his voice thick"',
      button: 'Retry without it',
      note: 'Never write "his voice thick".',
    }));
  it('flags past tense', () => expect(outputFlag(PAST, [])?.button).toBe('Retry in present tense'));
  it('blank lines ban nothing', () => expect(outputFlag(PRESENT, ['  ', ''])).toBeUndefined());
});
