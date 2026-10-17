import { describe, expect, it } from 'vitest';
import { exportAdventureJson, importAdventureJson } from '@adapters/transfer';
import { buildContext as build } from '@core/context';
import { eventsOf, textOf } from '@core/memory/assertionIndex';
import { dropUnsupported } from '@core/memory/invalidate';
import { byPlayer } from '@core/memory/looks';
import { repointSecrets } from '@core/memory/secrets';
import { YOU, youLines } from '@core/memory/you';
import { createBlankAdventure } from '@core/model';
import type { Action, Assertion } from '@core/model/types';
import * as S from '@core/schema';
import { derived } from './fixtures/assertions';
import { cast, input, lena } from './fixtures/structured';

const event = (who: string[], text = 'Pulled you from the river.', at = 1): Assertion => byPlayer(who[0] ?? YOU, at, { kind: 'event', text, who });
const act = (id: string, text: string): Action => ({ id, type: 'continue', versions: [text], active: 0, createdAt: 0 });

describe('events', () => {
  it('parse as an assertion and need someone who took part', () => {
    const e = event(['ent_a', YOU]);
    expect(S.Assertion.parse(e)).toMatchObject({ kind: 'event', subject: 'ent_a', who: ['ent_a', YOU] });
    expect(S.Assertion.safeParse({ ...e, who: [] }).success).toBe(false);
    expect(textOf(e)).toBe('Pulled you from the river.');
  });

  it('show on every card that took part, and are not lines about the player', () => {
    const as = [event(['ent_a', YOU]), event(['ent_b'], 'Lost the key.')];
    expect(eventsOf(as, 'ent_a')).toEqual([as[0]]);
    expect(eventsOf(as, YOU)).toEqual([as[0]]);
    expect(eventsOf(as, 'ent_c')).toEqual([]);
    expect(youLines([event([YOU])])).toEqual([]);
  });

  it('follow a merge to the surviving name, once', () => {
    const adv = { assertions: [event(['ent_a', 'ent_b'])] };
    repointSecrets(adv, 'ent_a', 'ent_b');
    expect(eventsOf(adv.assertions, 'ent_b').map((e) => e.who)).toEqual([['ent_b']]);
  });

  it('keep who took part across an export and import', () => {
    const a = createBlankAdventure('T', 'You wake.');
    a.entities = [{ id: 'ent_a', kind: 'character', name: 'Lena', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 0 }];
    a.assertions = [event(['ent_a', YOU])];
    const { adventure: b } = importAdventureJson(exportAdventureJson(a));
    const id = b.entities[0]?.id ?? '';
    expect(id).not.toBe('ent_a');
    expect(b.assertions).toMatchObject([{ kind: 'event', subject: id, who: [id, YOU] }]);
  });

  it("go when an edit removes the story's words they rest on", () => {
    const adv = createBlankAdventure('T', '');
    adv.actions = [act('a0', 'You reach the river.'), act('a1', 'Lena pulls you from the river.')];
    adv.assertions = [{ ...event(['ent_a', YOU]), producer: 'batch', basis: 'stated', span: 'pulls you from the river' }];
    expect(dropUnsupported(adv, adv.actions).facts).toBe(0);
    expect(dropUnsupported(adv, [adv.actions[0]!, act('a1', 'Lena waves from the bank.')]).facts).toBe(1);
    expect(adv.assertions).toEqual([]);
  });

  it('never reach a cast line', () => {
    const i = derived(input(4000));
    const before = cast(build(i));
    expect(cast(build({ ...i, assertions: [...i.assertions, event([lena.id], 'Lena drowned the miller.')] }))).toBe(before);
  });
});
