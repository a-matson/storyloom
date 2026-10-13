import { describe, expect, it } from 'vitest';
import { indexAssertions } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import type { HelperCallLog } from '@core/memory';
import { holderOf, YOU } from '@core/memory/items';
import { currentStates } from '@core/memory/looks';
import { readState, stateCast } from '@core/memory/stateRead';
import type { Adventure, Assertion, Entity } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const mira = mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0);
const tobin = mergeEntity(undefined, { name: 'Tobin', kind: 'character', description: '' }, 0);
const amulet = mergeEntity(undefined, { name: 'Amulet', kind: 'item', description: '' }, 0);

/** Action 3 is the player's (`do`), action 4 the AI's; the read covers both. */
function setup(texts: [string, string], changes: object[], present: Entity[] = [mira, tobin], items: string[] = []) {
  const adv: Adventure = memoryAdventure(5);
  adv.actions = adv.actions.slice(-5); // without the blank start, so action i is the fixture's i
  adv.settings.memory = { ...adv.settings.memory, stateRead: 'every' };
  for (const [i, t] of texts.entries()) {
    const a = adv.actions[3 + i];
    if (a) a.versions = [t];
  }
  adv.entities = [mira, tobin, amulet];
  adv.plot.scene = { present: present.map((e) => e.id), items };
  const reqs: CompletionRequest[] = [];
  const provider = fakeProvider(
    async function* (req) {
      reqs.push(req);
      yield { text: JSON.stringify({ changes }), done: true };
    },
    false,
    true,
  );
  const cuts = { cutCalls: 0, finishedPastCut: 0, calls: [] as HelperCallLog[] };
  return { adv, reqs, deps: { provider, template: adv.settings.template, cuts }, cuts };
}
const now = (adv: Adventure, id: string) => currentStates(indexAssertions(adv.assertions).of(id));

describe('the state read', () => {
  it('asks about the present characters and items, then you; nobody there makes no call', async () => {
    const { adv, reqs, deps } = setup(['You wait.', 'Mira sits.'], [], [mira], ['Amulet']);
    expect(stateCast(adv).map((s) => s.name)).toEqual(['Mira', 'Amulet', YOU]);
    await readState(adv, deps);
    const schema = JSON.stringify(reqs[0]?.jsonSchema);
    expect(schema).toContain('"enum":["Mira","Amulet","you"]');
    expect(schema).not.toContain('nobody');
    // Caps: 2 × present entries, 50 tokens each up to 160.
    expect(reqs[0]?.maxTokens).toBe(150);
    expect(reqs[0]?.jsonSchema).toMatchObject({ properties: { changes: { maxItems: 6 } } });

    const empty = setup(['You wait.', 'Rain falls.'], [], []);
    await readState(empty.adv, empty.deps);
    expect(empty.reqs).toHaveLength(0);
  });

  it('caps the tokens at 160', async () => {
    const { adv, reqs, deps } = setup(['You wait.', 'They wait.'], [], [mira, tobin], ['Amulet']);
    await readState(adv, deps);
    expect(reqs[0]?.maxTokens).toBe(160);
  });

  it('keeps an entry on its subject’s action, a pronoun-only one, and rejects another’s or one out of range', async () => {
    const { adv, deps, cuts } = setup(
      ['You wait.', 'Mira sits down. Tobin falls asleep. She smiles.'],
      [
        { who: 'Mira', key: 'posture', now: 'sitting', at: 4 },
        { who: 'Tobin', key: 'condition', now: 'asleep', at: 4 },
        { who: 'Mira', key: 'mood', now: 'calm', at: 1 },
      ],
    );
    const r = await readState(adv, deps);
    expect(now(adv, mira.id)).toEqual({ posture: 'sitting' });
    expect(r.rejected).toEqual([{ value: 'Mira mood: calm', reason: 'at-range' }]);
    expect(cuts.calls[0]).toMatchObject({ job: 'state', accepted: 2 });

    const pronoun = setup(['You wait.', 'She smiles.'], [{ who: 'Mira', key: 'mood', now: 'happy', at: 4 }]);
    await readState(pronoun.adv, pronoun.deps);
    expect(now(pronoun.adv, mira.id)).toEqual({ mood: 'happy' });

    const other = setup(['You wait.', 'Tobin smiles.'], [{ who: 'Mira', key: 'mood', now: 'happy', at: 4 }]);
    expect((await readState(other.adv, other.deps)).rejected).toEqual([{ value: 'Mira mood: happy', reason: 'wrong-subject' }]);
  });

  it('rejects a value cut mid-word at the cap and one the current value already holds', async () => {
    const { adv, deps } = setup(
      ['You wait.', 'Mira is tired.'],
      [
        { who: 'Mira', key: 'mood', now: 'deeply and utterly t', at: 4 },
        { who: 'Mira', key: 'condition', now: 'tired', at: 4 },
      ],
    );
    adv.assertions = [
      { id: 'x', subject: mira.id, producer: 'player', at: 0, basis: 'player', since: 0, kind: 'state', key: 'condition', value: 'very tired' },
    ];
    expect((await readState(adv, deps)).rejected.map((x) => x.reason)).toEqual(['cut', 'unchanged']);
  });

  it('lets the later action win for one key, and supersedes the old value', async () => {
    const { adv, deps } = setup(
      ['Mira stands.', 'Mira sits again.'],
      [
        { who: 'Mira', key: 'posture', now: 'sitting', at: 4 },
        { who: 'Mira', key: 'posture', now: 'standing', at: 3 },
      ],
    );
    await readState(adv, deps);
    expect(now(adv, mira.id)).toEqual({ posture: 'sitting' });
    const ended = adv.assertions.find((a) => a.kind === 'state' && a.value === 'standing');
    expect(ended).toMatchObject({ until: 4, producer: 'turn', basis: 'player', at: 3 });
  });

  it('turns holds into the item’s holder, ending its place', async () => {
    const { adv, deps } = setup(['You wait.', 'Mira takes the amulet.'], [{ who: 'Mira', key: 'holds', now: 'the amulet', at: 4 }], [mira], ['Amulet']);
    adv.assertions = [{ id: 'p', subject: amulet.id, producer: 'turn', at: 0, basis: 'stated', since: 0, kind: 'state', key: 'location', value: 'the altar' }];
    await readState(adv, deps);
    const ix = indexAssertions(adv.assertions);
    expect(holderOf(ix, amulet)).toBe('Mira');
    expect(now(adv, amulet.id)).toEqual({ holder: 'Mira' });
  });

  it('stores the player as `you`, with basis player on their own line', async () => {
    const { adv, deps } = setup(['You put on the amulet and feel stronger.', 'Mira nods.'], [{ who: 'you', key: 'condition', now: 'stronger', at: 3 }], [mira]);
    await readState(adv, deps);
    const mine = adv.assertions.filter((a) => a.subject === YOU);
    expect(mine).toContainEqual(expect.objectContaining({ kind: 'state', key: 'condition', value: 'stronger', basis: 'player', producer: 'turn' }));
  });

  it('proposes an effect when the condition’s action names its cause', async () => {
    const { adv, deps } = setup(
      ['You wait.', 'The Amulet glows and Mira grows weak.'],
      [{ who: 'Mira', key: 'condition', now: 'weak', at: 4 }],
      [mira],
      ['Amulet'],
    );
    await readState(adv, deps);
    const effect = adv.assertions.find((a): a is Extract<Assertion, { kind: 'effect' }> => a.kind === 'effect');
    expect(effect).toMatchObject({ subject: mira.id, condition: 'weak', seen: false, cause: { kind: 'item', id: amulet.id, text: 'Amulet' } });
    expect(now(adv, mira.id)).toEqual({ condition: 'weak' });
  });

  it('reads one output once, and again after a retry', async () => {
    const { adv, reqs, deps } = setup(['You wait.', 'Mira sits.'], []);
    await readState(adv, deps);
    await readState(adv, deps);
    expect(reqs).toHaveLength(1);
    const last = adv.actions.at(-1);
    if (last) last.versions = ['Mira stands.'];
    await readState(adv, deps);
    expect(reqs).toHaveLength(2);
  });
});
