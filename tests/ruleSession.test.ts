import { describe, expect, it } from 'vitest';
import { entityEdits } from '@app/session/entities';
import { addRule, ruleEdits } from '@app/session/rules';
import { createBlankAdventure, type Entity } from '@core/model';
import { setup } from './fixtures/session';

const ent = (id: string, name: string, over: Partial<Entity> = {}): Entity => ({
  id,
  kind: 'character',
  name,
  aliases: [],
  description: '',
  facts: [],
  state: {},
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
  ...over,
});

function withCast() {
  const adventure = createBlankAdventure('Test', 'You wait on the quay.');
  adventure.entities = [ent('ent_mira', 'Mira'), ent('ent_grub', 'Grub'), ent('ent_grubb', 'Grubb')];
  return setup({ adventure });
}

describe('player rules', () => {
  it('/rule gates on the entities its text names and is sent as [Rules: …] when ungated', async () => {
    const { session } = withCast();
    await addRule(session, 'Mira never lies.');
    await addRule(session, 'Salt is money.');
    const [gated, always] = session.adv.rules;
    expect(gated).toMatchObject({ gates: ['ent_mira'], source: 'player', status: 'confirmed' });
    expect(always?.gates).toEqual([]);
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('[Rules: Salt is money]');
    expect(session.getSnapshot().context?.result.usedRuleIds).toEqual([always?.id]);
  });

  it('a proposed rule is sent once confirmed', async () => {
    const { session } = withCast();
    await addRule(session, 'Salt is money.');
    const id = session.adv.rules[0]?.id ?? '';
    ruleEdits(session).update(id, { status: 'proposed' });
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).not.toContain('[Rules:');
    ruleEdits(session).update(id, { status: 'confirmed' });
    await session.previewContext();
    expect(session.getSnapshot().context?.prompt).toContain('[Rules: Salt is money]');
  });

  it('deleting an entity drops its gate; merging hands the gate on', async () => {
    const { session } = withCast();
    await addRule(session, 'Mira and Grub are kin.');
    await addRule(session, 'Grubb bites.');
    entityEdits(session).delete('ent_mira');
    await entityEdits(session).merge('ent_grub', 'ent_grubb');
    expect(session.adv.rules.map((r) => r.gates)).toEqual([['ent_grub'], ['ent_grub']]);
  });

  it('ending an effect stamps `until` and keeps the fact', () => {
    const { session } = withCast();
    session.adv.entities[0]?.facts.push({ id: 'f1', text: 'Cursed', fromAction: 0, source: 'memory', kind: 'effect', value: 'cursed' });
    entityEdits(session).endEffect('ent_mira', 'f1');
    expect(session.adv.entities[0]?.facts[0]?.until).toBe(session.log.actions.length);
  });
});
