import { describe, expect, it } from 'vitest';
import { findRules, findRulesPrompt } from '@core/memory/findRules';
import type { Adventure, LegacyEntity, Rule } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { makeAdventure } from './fixtures/adventure';
import { derived } from './fixtures/assertions';
import { fakeProvider } from './fixtures/memoryJobs';

const PASSAGE = 'The minotaur sniffs the mintnip, a known aphrodisiac for minotaurs, and blushes.';

const entity = (name: string): LegacyEntity => ({
  id: `ent_${name}`,
  kind: 'character',
  name,
  aliases: [],
  description: '',
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});

function adventure(rules: Rule[] = []): Adventure {
  const adv = makeAdventure({ actions: 2, cards: 0 });
  adv.entities = [entity('Minotaur'), entity('Mira')];
  adv.actions[1] = { ...adv.actions[1]!, versions: [PASSAGE], active: 0 };
  adv.rules = rules;
  return derived(adv);
}

async function run(reply: string, adv = adventure(), jsonSchema = true) {
  const requests: CompletionRequest[] = [];
  const provider = fakeProvider(
    async function* (req) {
      requests.push(req);
      yield { text: reply, done: true };
    },
    false,
    jsonSchema,
  );
  return { rules: await findRules(adv, { provider, template: 'chatml' }, 1), requests };
}

describe('findRulesPrompt', () => {
  it('holds the passage and the known names, and no worked example', () => {
    const p = findRulesPrompt(PASSAGE, ['Minotaur', 'Mira']);
    expect(p).toContain(PASSAGE);
    expect(p).toContain('Known names: Minotaur, Mira');
    expect(p).toContain('empty list when there is none');
    expect(p).not.toMatch(/example/i);
  });
});

describe('findRules', () => {
  it('maps a reply to proposed story rules gated on the entities they name', async () => {
    const { rules, requests } = await run(JSON.stringify({ rules: [{ text: 'Mintnip is an aphrodisiac for minotaurs.', about: ['Minotaur'] }] }));
    expect(rules).toMatchObject([
      { text: 'Mintnip is an aphrodisiac for minotaurs.', gates: ['ent_Minotaur'], source: 'story', status: 'proposed', fromAction: 1 },
    ]);
    expect(requests[0]).toMatchObject({ slotId: 1, maxTokens: 200, temperature: 0.2, cachePrompt: false });
    expect(requests[0]?.jsonSchema).toBeDefined();
  });

  it('reads a prefilled reply without json_schema', async () => {
    const { rules, requests } = await run('"rules": [{"text": "Kobolds fear fire.", "about": []}]}', adventure(), false);
    expect(rules.map((r) => r.text)).toEqual(['Kobolds fear fire.']);
    expect(rules[0]?.gates).toEqual([]);
    expect(requests[0]?.jsonSchema).toBeUndefined();
  });

  it('drops a rule the adventure already holds', async () => {
    const held: Rule = { id: 'r1', text: 'kobolds fear fire', gates: [], source: 'player', status: 'confirmed', createdAt: 0, fromAction: 0 };
    const { rules } = await run(JSON.stringify({ rules: [{ text: 'Kobolds fear fire.', about: [] }] }), adventure([held]));
    expect(rules).toEqual([]);
  });

  it('makes nothing from an empty or damaged reply', async () => {
    expect((await run(JSON.stringify({ rules: [] }))).rules).toEqual([]);
    expect((await run('The minotaur blushes.')).rules).toEqual([]);
  });

  it('keeps at most 3 rules', async () => {
    const reply = { rules: ['A is so.', 'B is so.', 'C is so.', 'D is so.'].map((text) => ({ text, about: [] })) };
    expect((await run(JSON.stringify(reply))).rules.map((r) => r.text)).toEqual(['A is so.', 'B is so.', 'C is so.']);
  });
});
