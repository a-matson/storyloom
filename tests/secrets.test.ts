import { describe, expect, it } from 'vitest';
import { defaultKnownBy, newSecret, repointSecrets, secretsOf } from '@core/memory/secrets';
import { YOU, youLines } from '@core/memory/you';
import * as S from '@core/schema';

const presence = [
  { at: 2, present: ['ent_minos'] },
  { at: 5, present: ['ent_minos', 'ent_vorthak'] },
  { at: 9, present: [] },
];

describe('secrets', () => {
  it('default to you plus whoever was present at the marked action', () => {
    expect(defaultKnownBy({ presence }, 6)).toEqual([YOU, 'ent_minos', 'ent_vorthak']);
    expect(defaultKnownBy({ presence }, 4)).toEqual([YOU, 'ent_minos']);
    expect(defaultKnownBy({ presence }, 1)).toEqual([YOU]);
    expect(defaultKnownBy({}, 6)).toEqual([YOU]);
  });

  it('are pinned at the marked action, always known to you, and parse as an assertion', () => {
    const s = newSecret(47, 'You sold King Rat the tunnel keys.', ['ent_minos', YOU]);
    expect(S.Assertion.parse(s)).toMatchObject({ kind: 'secret', subject: YOU, at: 47, since: 47, pinned: true, knownBy: [YOU, 'ent_minos'] });
  });

  it('rest on the gist as their span when the action holds it', () => {
    expect(newSecret(4, 'You sold the keys.', [], '> You sold the keys. You wink.')).toMatchObject({ span: 'You sold the keys.' });
    expect(newSecret(4, 'The keys are sold.', [], '> You sold the keys.')).not.toHaveProperty('span');
  });

  it('are not lines about the player', () => {
    expect(youLines([newSecret(1, 'A secret.', [])])).toEqual([]);
  });

  it('follow a merge to the surviving name, once', () => {
    const adv = { assertions: [newSecret(1, 'A secret.', ['ent_a', 'ent_b']), newSecret(2, 'Other.', ['ent_c'])] };
    repointSecrets(adv, 'ent_a', 'ent_b');
    expect(secretsOf(adv.assertions).map((s) => s.knownBy)).toEqual([
      [YOU, 'ent_b'],
      [YOU, 'ent_c'],
    ]);
  });
});
