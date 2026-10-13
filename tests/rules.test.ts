import { describe, expect, it } from 'vitest';
import { buildContext } from '@core/context';
import { relevantRules, renderRules, type RuleContext } from '@core/context/rules';
import { mergeEntity } from '@core/memory/entities';
import type { Entity, EntityFact, Rule } from '@core/model';
import { ixOf } from './fixtures/assertions';

const ent = (name: string, kind: Entity['kind'], over: Partial<Entity> = {}): Entity => ({
  ...mergeEntity(undefined, { name, kind, description: '' }, 0),
  id: `ent_${name}`,
  ...over,
});

let t = 0;
const rule = (text: string, gates: string[] = [], status: Rule['status'] = 'confirmed'): Rule => ({
  id: `rule_${text}`,
  text,
  gates,
  source: 'player',
  status,
  createdAt: ++t,
  fromAction: 0,
});

const cursed: EntityFact = {
  id: 'f1',
  text: 'cursed',
  fromAction: 1,
  source: 'player',
  kind: 'effect',
  value: 'cursed',
  cause: { kind: 'rule', id: 'rule_The idol curses', text: 'the idol' },
};

const mira = ent('Mira', 'character');
const grub = ent('Grub', 'character', { state: { species: 'kobold' } });
const vex = ent('Vex', 'character', { relations: [{ to: 'ent_Ashen Order', label: 'member' }] });
const kobolds = ent('Kobolds', 'faction');
const order = ent('Ashen Order', 'faction');
const horn = ent('Horn', 'item', { state: { holder: 'you' } });
const key = ent('Key', 'item', { state: { holder: 'Mira' } });
const ledger = ent('Ledger', 'item', { state: { location: 'Tower' } });
const tower = ent('Tower', 'place');
const all = [mira, grub, vex, kobolds, order, horn, key, ledger, tower];

const ctx = (present: Entity[] = [], mentioned: Entity[] = [], entities = all): RuleContext => ({
  entities,
  ix: ixOf(entities),
  scene: { location: 'Hall', present: present.map((e) => e.name) },
  present: new Set(present.map((e) => e.id)),
  mentioned: new Set(mentioned.map((e) => e.id)),
});

const texts = (rules: Rule[], c: RuleContext) => relevantRules(rules, c).map((r) => r.text);

describe('relevantRules', () => {
  it('sends an ungated rule always and a proposed one never', () => {
    expect(texts([rule('Magic is rare'), rule('Dragons lie', [], 'proposed')], ctx())).toEqual(['Magic is rare']);
  });

  it('sends a gated rule when its gate is present or named, not otherwise', () => {
    const r = [rule('Mira never lies', [mira.id])];
    expect(texts(r, ctx())).toEqual([]);
    expect(texts(r, ctx([mira]))).toEqual(['Mira never lies']);
    expect(texts(r, ctx([], [mira]))).toEqual(['Mira never lies']);
  });

  it('sends an item rule when you hold it, someone present holds it, or it lies here', () => {
    expect(texts([rule('The horn calls wolves', [horn.id])], ctx())).toEqual(['The horn calls wolves']);
    const k = [rule('The key opens any door', [key.id])];
    expect(texts(k, ctx())).toEqual([]);
    expect(texts(k, ctx([mira]))).toEqual(['The key opens any door']);
    const l = [rule('The ledger is forged', [ledger.id])];
    expect(texts(l, ctx())).toEqual([]);
    expect(texts(l, { ...ctx(), scene: { location: 'Tower', present: [] } })).toEqual(['The ledger is forged']);
  });

  it('sends a faction rule when a present character belongs by relation or species', () => {
    const r = [rule('Kobolds fear fire', [kobolds.id]), rule('The Order keeps oaths', [order.id])];
    expect(texts(r, ctx([mira]))).toEqual([]);
    expect(texts(r, ctx([grub]))).toEqual(['Kobolds fear fire']);
    expect(texts(r, ctx([vex]))).toEqual(['The Order keeps oaths']);
  });

  it('sends a rule that governs an active effect on someone present', () => {
    const r = [rule('The idol curses', [ent('Idol', 'item').id])];
    const hexed = { ...mira, facts: [cursed] };
    const entities = [hexed, ...all.slice(1)];
    expect(texts(r, ctx([hexed], [], entities))).toEqual(['The idol curses']);
    const ended = { ...mira, facts: [{ ...cursed, until: 2 }] };
    expect(texts(r, ctx([ended], [], [ended, ...all.slice(1)]))).toEqual([]);
  });

  it('puts ungated rules first, then oldest first', () => {
    const gated = rule('Mira never lies', [mira.id]);
    const early = rule('Magic is rare');
    const late = rule('Iron burns fey');
    expect(texts([gated, late, early], ctx([mira]))).toEqual(['Magic is rare', 'Iron burns fey', 'Mira never lies']);
  });
});

describe('the [Rules: …] line', () => {
  const build = (rules: Rule[]) =>
    buildContext({
      actions: [{ id: 'a0', type: 'start', versions: ['You wake.'], active: 0, createdAt: 0 }],
      plot: { authorsNote: 'AN', scene: { location: 'Hall', present: [] } },
      storyCards: [],
      entities: [],
      rules,
      rankedMemories: [],
      settings: { contextLength: 400, memoryBankEnabled: false, cacheStableLayout: false, evictionChunk: 8 },
      tokenizer: { count: (s) => Math.ceil(s.length / 4) },
    });

  it('comes just before the scene, outside the cached prefix', () => {
    const r = build([rule('Magic is rare.'), rule('The Duke never forgives', ['ent_duke'])]);
    const kinds = r.sections.map((s) => s.kind);
    expect(kinds.indexOf('rules')).toBe(kinds.indexOf('scene') - 1);
    expect(r.sections.find((s) => s.kind === 'rules')).toMatchObject({ text: '[Rules: Magic is rare]', cacheable: false });
    expect(r.usedRuleIds).toEqual(['rule_Magic is rare.']);
  });

  it('keeps as many rules as the structured cap holds', () => {
    // 40-token cap: one ~28-token rule fits, two do not.
    const long = 'w'.repeat(110);
    const r = build([rule(`a ${long}`), rule(`b ${long}`)]);
    expect(r.usedRuleIds).toEqual([`rule_a ${long}`]);
    expect(r.budget.structuredUsed).toBeLessThanOrEqual(r.budget.structuredBudget);
  });
});

describe('renderRules', () => {
  it('joins rules as clauses without their full stops', () => {
    expect(renderRules([rule('Magic is rare.'), rule(' Kobolds fear fire ')])).toBe('Magic is rare; Kobolds fear fire');
  });
});
