import { describe, expect, it } from 'vitest';
import { causeIn, endsCurrent, grounded } from '@core/memory/grounding';

const named = (name: string) => ({ name, aliases: [] });

describe('grounded', () => {
  it('takes a shared content word, stemmed, or a condition synonym', () => {
    expect(grounded('unconscious', 'He lies out cold on the floor.')).toBe(true);
    expect(grounded('bleeding', 'Her arm bleeds.')).toBe(true);
    expect(grounded('angry', 'Mira smiles.')).toBe(false);
  });
});

describe('endsCurrent', () => {
  it('lets a waking or standing value end the state it replaces, and nothing else', () => {
    expect(endsCurrent('condition', 'awake', 'asleep')).toBe(true);
    expect(endsCurrent('condition', 'awake', undefined)).toBe(false);
    expect(endsCurrent('posture', 'standing', 'lying on the floor')).toBe(true);
    expect(endsCurrent('mood', 'calm', 'angry')).toBe(false);
  });
});

describe('causeIn', () => {
  it('takes the name in the condition’s sentence only', () => {
    const vorthak = named('Vorthak');
    expect(causeIn('Vorthak laughs. Weever falls, hurt.', 'hurt', [vorthak])).toBeUndefined();
    expect(causeIn('Weever laughs. Vorthak stabs him and he is hurt.', 'hurt', [vorthak])).toBe(vorthak);
  });
});
