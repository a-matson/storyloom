import { describe, expect, it } from 'vitest';
import { presentLine } from '@core/context/cast';
import { nowLines } from '@core/context/structured';
import type { HelperCallLog } from '@core/memory';
import { mergeEntity } from '@core/memory/entities';
import { currentStates } from '@core/memory/looks';
import { checkMeanwhile, readMeanwhile, returning } from '@core/memory/meanwhile';
import type { Adventure, Assertion } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const mira = { ...mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0), canon: true };
const bram = mergeEntity(undefined, { name: 'Bram Holt', kind: 'character', description: '' }, 0);
const base = { producer: 'batch', basis: 'stated' } as const;
const goal: Assertion = { ...base, id: 'g', subject: mira.id, at: 1, since: 1, kind: 'goal', text: 'find her brother' };
const event: Assertion = { ...base, id: 'ev', subject: bram.id, at: 8, since: 8, kind: 'event', text: 'Bram Holt burned the mill', who: [bram.id] };
const meanwhile = (value: string, since: number, seen?: boolean): Assertion => ({
  ...base,
  id: `m${since}`,
  subject: mira.id,
  at: since,
  since,
  kind: 'state',
  key: 'meanwhile',
  value,
  ...(seen === undefined ? {} : { seen }),
});

/** Actions 0–19; Mira was here from 0, left at `left`, and the turn read put her back at the last action. */
function setup(left: number, reply = 'She searched the docks for her brother.') {
  const adv: Adventure = memoryAdventure(19);
  adv.entities = [mira, bram];
  adv.assertions = [goal, event];
  const back = adv.actions.length - 1;
  adv.plot.presence = [
    { at: 0, present: [mira.id] },
    { at: left, present: [] },
    { at: back, present: [mira.id] },
  ];
  adv.plot.scene = { present: [mira.id] };
  const reqs: CompletionRequest[] = [];
  const provider = fakeProvider(async function* (req) {
    reqs.push(req);
    yield { text: reply, done: true };
  });
  const deps = { provider, template: adv.settings.template, cuts: { cutCalls: 0, finishedPastCut: 0, calls: [] as HelperCallLog[] } };
  return { adv, reqs, deps, back };
}

describe('off-screen life (M26-7)', () => {
  it('a character back after 12+ actions away is returning; after 5 is not', () => {
    expect(returning(setup(2).adv).map((r) => [r.entity.name, r.left, r.back])).toEqual([['Mira', 2, 19]]);
    expect(returning(setup(14).adv)).toEqual([]);
  });

  it('nobody first met now, or back before the last action, is returning', () => {
    const { adv } = setup(2);
    adv.plot.presence = [{ at: 19, present: [mira.id] }];
    expect(returning(adv)).toEqual([]);
    adv.actions = [...adv.actions, ...adv.actions.slice(-1)];
    adv.plot.presence = setup(2).adv.plot.presence;
    expect(returning(adv)).toEqual([]);
  });

  it('a return makes one slot-1 call with the goal and the events, and stores a proposal at the return', async () => {
    const { adv, reqs, deps, back } = setup(2);
    expect(await readMeanwhile(adv, deps)).toEqual({ changed: 1 });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ slotId: 1, maxTokens: 60, temperature: 0.7, cachePrompt: false });
    expect(reqs[0]?.prompt).toContain('Mira wants: find her brother');
    expect(reqs[0]?.prompt).toContain('- Bram Holt burned the mill');
    expect(adv.assertions.at(-1)).toMatchObject({
      kind: 'state',
      key: 'meanwhile',
      value: 'She searched the docks for her brother.',
      since: back,
      seen: false,
    });
    // A second read at the same return asks nothing.
    expect(await readMeanwhile(adv, deps)).toEqual({ changed: 0 });
    expect(reqs).toHaveLength(1);
    // Not a value of the moment: the state read and the card's Now keys never see it.
    expect(currentStates(adv.assertions.filter((a) => a.subject === mira.id))).toEqual({});
  });

  it('no return, or nothing to ground it on, asks nothing', async () => {
    const short = setup(14);
    expect(await readMeanwhile(short.adv, short.deps)).toEqual({ changed: 0 });
    const bare = setup(2);
    bare.adv.assertions = [];
    expect(await readMeanwhile(bare.adv, bare.deps)).toEqual({ changed: 0 });
    expect([...short.reqs, ...bare.reqs]).toEqual([]);
  });

  it('an invented name is rejected and stores nothing', async () => {
    const { adv, deps } = setup(2, 'She met Lord Varn at the docks.');
    expect(await readMeanwhile(adv, deps)).toEqual({ changed: 0 });
    expect(deps.cuts.calls[0]).toMatchObject({ accepted: 0, rejected: [{ reason: 'invented' }] });
  });
});

describe('checkMeanwhile', () => {
  const known = ['Mira', 'Bram Holt'];
  it('rejects an unknown name, also opening the sentence', () => {
    expect(checkMeanwhile('She met Lord Varn.', known)).toBeUndefined();
    expect(checkMeanwhile('Varn hid her.', known)).toBeUndefined();
  });
  it('accepts known names and a pronoun opening, and keeps one sentence of at most 30 words', () => {
    expect(checkMeanwhile("She followed Bram Holt's trail. Then she slept.", known)).toBe("She followed Bram Holt's trail.");
    expect(checkMeanwhile('Mira waited.', known)).toBe('Mira waited.');
    expect(checkMeanwhile(`She ${'walked and '.repeat(20)}rested.`, known)?.split(' ')).toHaveLength(30);
    expect(checkMeanwhile('  ', known)).toBeUndefined();
  });
});

describe('the meanwhile now-line', () => {
  const line = (as: Assertion[], active: number) => presentLine(mira, as, [mira], false, [], false, '', false, active).text;
  it('is sent while the character has not acted since the return, and not after', () => {
    expect(line([meanwhile('she searched the docks', 19)], 19)).toBe('Mira — meanwhile: she searched the docks.');
    expect(line([meanwhile('she searched the docks', 19)], 20)).toBe('Mira.');
  });
  it('an unseen proposal is not sent', () => {
    expect(line([meanwhile('she searched the docks', 19, false)], 19)).toBe('Mira.');
  });
  it('the Now card shows it until she speaks', () => {
    const { adv } = setup(2);
    adv.assertions = [meanwhile('she searched the docks', 19)];
    expect(nowLines(adv).lines[0]?.text).toBe('Mira — was away for part of the scene and does not know what was said then; meanwhile: she searched the docks.');
    adv.actions = [...adv.actions, { ...adv.actions[19]!, id: 'a20', speakers: [{ name: 'Mira' }] }] as Adventure['actions'];
    expect(nowLines(adv).lines[0]?.text).not.toContain('meanwhile');
  });
});
