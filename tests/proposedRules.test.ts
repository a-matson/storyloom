import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { EXTRACT_JSON_SCHEMA } from '@core/memory/extractJsonSchema';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { extractPrompt } from '@core/text/prompts';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

function withReply(rules: unknown) {
  const adv = memoryAdventure(30);
  adv.entities = [mergeEntity(undefined, { name: 'Kobolds', kind: 'faction', description: '', facts: [] }, 0)];
  adv.rules = [{ id: 'r0', text: 'The well is dry.', gates: [], source: 'player', status: 'confirmed', createdAt: 0, fromAction: 0 }];
  const reply = { entities: [], speakers: [], rules };
  const provider = fakeProvider(
    async function* (req) {
      yield { text: req.prompt.includes(ENTITY_PROMPT) ? JSON.stringify(reply) : 'Mira found the map.', done: true };
    },
    false,
    true,
  );
  return { adv, deps: { ...fakeDeps(adv).deps, provider } };
}

describe('story-proposed rules', () => {
  it('lands as proposed story rules, gates resolved by name, unknown names and known texts dropped', async () => {
    const { adv, deps } = withReply([
      { text: 'Kobolds fear fire.', gates: ['kobolds', 'Nobody'] },
      { text: 'the well is dry', gates: [] },
    ]);
    await runMemoryMaintenance(adv, deps);
    expect(adv.rules.slice(1)).toEqual([
      expect.objectContaining({ text: 'Kobolds fear fire.', gates: [adv.entities[0]?.id], source: 'story', status: 'proposed' }),
    ]);
  });

  it('keeps at most two from one reply', async () => {
    const { adv, deps } = withReply(['A.', 'B.', 'C.'].map((text) => ({ text, gates: [] })));
    await runMemoryMaintenance(adv, deps);
    expect(adv.rules.map((r) => r.text)).toEqual(['The well is dry.', 'A.', 'B.']);
  });

  it('asks for rules in the prompt and the grammar', () => {
    expect(extractPrompt('[0] Mira waves.', [], true)).toMatch(/"rules": \[\.\.\.\]/);
    expect(extractPrompt('[0] Mira waves.', [], false)).toMatch(/"rules": \[\{"text": "<a lasting truth>", "gates": \["<Name>"\]\}\]/);
    expect(EXTRACT_JSON_SCHEMA).toMatchObject({ properties: { rules: { maxItems: 2 } } });
  });
});
