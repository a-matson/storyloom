import { describe, expect, it } from 'vitest';
import { indexAssertions } from '@core/memory/assertionIndex';
import { mergeEntity } from '@core/memory/entities';
import type { HelperCallLog } from '@core/memory';
import { introduce } from '@core/memory/introduce';
import { currentStates } from '@core/memory/looks';
import { readState } from '@core/memory/stateRead';
import type { Adventure } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const mira = mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0);
const tobin = mergeEntity(undefined, { name: 'Tobin', kind: 'character', description: '' }, 0);

/** Mira is there before the turn; action 3 is the player's, 4 the AI's. The reply's scene adds Tobin. */
function setup(changes: object[], stop: 'eos' | 'length' = 'eos', stay: object = { Mira: 'here' }) {
  const adv: Adventure = memoryAdventure(5);
  adv.actions = adv.actions.slice(-5);
  adv.settings.memory = { ...adv.settings.memory, introductions: false, sceneEachTurn: true, stateRead: 'every' };
  for (const [i, t] of ['Mira kneels by the well.', 'You sit. Tobin walks in; Mira sits down, tired.'].entries()) {
    const a = adv.actions[3 + i];
    if (a) a.versions = [t];
  }
  adv.entities = [mira, tobin];
  adv.plot.scene = { location: 'the well', present: [mira.id] };
  const reqs: CompletionRequest[] = [];
  const scene = { location: 'the well', present: ['Mira', 'Tobin'], stay, weather: 'unchanged' };
  const provider = fakeProvider(
    async function* (req) {
      reqs.push(req);
      yield { text: JSON.stringify({ scene, changes }), done: true, stats: { stopReason: stop } };
    },
    false,
    true,
  );
  const cuts = { cutCalls: 0, finishedPastCut: 0, calls: [] as HelperCallLog[] };
  return { adv, reqs, cuts, deps: { provider, template: adv.settings.template, cuts } };
}
const now = (adv: Adventure, id: string) => currentStates(indexAssertions(adv.assertions).of(id));

describe('the merged turn read (M17-1)', () => {
  it('applies the scene, then the changes, in one call; the standalone read then skips the turn', async () => {
    const { adv, reqs, cuts, deps } = setup([{ who: 'Mira', key: 'posture', now: 'sitting', at: 4 }]);
    const r = await introduce(adv, deps, undefined, { state: true });
    expect(reqs).toHaveLength(1);
    expect(adv.plot.scene?.present).toEqual([mira.id, tobin.id]);
    expect(now(adv, mira.id)['posture']).toBe('sitting');
    expect(r.state?.changed).toBe(1);
    // Cards and sightings, the scene, one change.
    expect(cuts.calls[0]?.accepted).toBe(r.touched + 1 + 1);
    // Scene budget + 8 per verdict (Mira) + 40 per entry it may give (Mira, you, one more).
    expect(reqs[0]?.maxTokens).toBe(80 + 8 + 120);
    await readState(adv, deps);
    expect(reqs).toHaveLength(1);
  });

  it('asks about the scene before the reply: someone it adds is not in the enum', async () => {
    const { adv, reqs, deps } = setup([]);
    await introduce(adv, deps, undefined, { state: true });
    const schema = JSON.stringify(reqs[0]?.jsonSchema);
    expect(schema).toContain('"who":{"type":"string","enum":["Mira","you"]}');
  });

  it('accepts a change only in the last two actions of a longer passage', async () => {
    const { adv, reqs, cuts, deps } = setup([{ who: 'Mira', key: 'mood', now: 'angry', at: 1 }]);
    await introduce(adv, deps, undefined, { state: true });
    expect(reqs[0]?.prompt).toContain('[1] ');
    expect(now(adv, mira.id)['mood']).toBeUndefined();
    expect(cuts.calls[0]?.rejected).toEqual([{ value: 'Mira mood: angry', reason: 'at-range' }]);
  });

  it('drops the last change of a cut reply', async () => {
    const changes = [
      { who: 'Mira', key: 'posture', now: 'sitting', at: 4 },
      { who: 'Mira', key: 'condition', now: 'tired', at: 4 },
    ];
    const { adv, deps } = setup(changes, 'length');
    await introduce(adv, deps, undefined, { state: true });
    expect(now(adv, mira.id)).toEqual({ posture: 'sitting' });
  });

  it('a room keeps the character present there (M21-1); `left` is gone', async () => {
    const { adv, deps } = setup([], 'eos', { Mira: { room: 'the cellar' } });
    await introduce(adv, deps);
    expect(adv.plot.scene?.present).toEqual([mira.id, tobin.id]);
    expect(adv.plot.scene?.zones).toEqual({ [mira.id]: 'the cellar' });
    expect(adv.plot.presence?.at(-1)?.present).toEqual([tobin.id]);
    const old = setup([], 'eos', { Mira: 'left' });
    await introduce(old.adv, old.deps);
    expect(old.adv.plot.scene?.present).toEqual([tobin.id]);
  });

  it('tells the read who is in another room, so it keeps them there', async () => {
    const { adv, reqs, deps } = setup([]);
    adv.plot.scene = { location: 'the well', present: [mira.id, tobin.id], zones: { [mira.id]: 'the cellar', [tobin.id]: 'the cellar' } };
    await introduce(adv, deps);
    expect(reqs[0]?.prompt).toContain('Previous scene: location "the well", present: Mira, Tobin; in the cellar: Mira, Tobin. Known');
  });

  it('asks no changes without the option', async () => {
    const { adv, reqs, deps } = setup([{ who: 'Mira', key: 'posture', now: 'sitting', at: 4 }]);
    const r = await introduce(adv, deps);
    expect(JSON.stringify(reqs[0]?.jsonSchema)).not.toContain('changes');
    expect(r.state).toBeUndefined();
    expect(now(adv, mira.id)['posture']).toBeUndefined();
  });
});
