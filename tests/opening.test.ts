import { describe, expect, it } from 'vitest';
import { createAdventureFromScenario, creatorChoices, newScenario, type Scenario, type StoryCard } from '@core/model';
import { openingRequest, writeOpening } from '@core/cards/opening';
import type { CompletionRequest, Provider } from '@core/ports/provider';

const card = (id: string, type: string, entry: string, selectable?: boolean): StoryCard => ({
  id,
  type,
  name: id,
  entry,
  triggers: [id],
  ...(selectable === undefined ? {} : { selectable }),
});

function creator(): Scenario {
  return {
    ...newScenario('Keep', 'You wake in the keep of ${Which keep?}.'),
    type: 'characterCreator',
    plot: { aiInstructions: 'Narrate grimly.', plotEssentials: 'The keep is under siege.' },
    storyCards: [
      card('mage', 'Class', 'You are a mage.', true),
      card('elf', 'Race', 'You are an elf.', true),
      card('rogue', 'Class', 'You are a rogue of ${Which keep?}.', true),
      card('castle', 'Location', 'The keep has three towers.'),
      card('dwarf', 'Race', 'You are a dwarf.', false),
    ],
  };
}

function recorder(reply: string): Provider & { last?: CompletionRequest } {
  const p: Provider & { last?: CompletionRequest } = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: async () => ({ ok: true }),
    capabilities: async () => {
      throw new Error('not used');
    },
    async *complete(req) {
      p.last = req;
      yield { text: reply, done: false };
      yield { text: '', done: true };
    },
  };
  return p;
}

describe('character creator', () => {
  it('groups selectable cards by Type in first-seen order, only for Character Creator', () => {
    const groups = creatorChoices(creator());
    expect(groups.map((g) => [g.type, g.options.map((c) => c.id)])).toEqual([
      ['Class', ['mage', 'rogue']],
      ['Race', ['elf']],
    ]);
    expect(creatorChoices({ ...creator(), type: 'story' })).toEqual([]);
  });

  it('copies picked and non-selectable cards and appends the picked entries to the prompt', () => {
    const adv = createAdventureFromScenario(creator(), { 'Which keep?': 'Varn' }, undefined, ['rogue', 'elf']);
    expect(adv.storyCards.map((c) => c.name)).toEqual(['elf', 'rogue', 'castle', 'dwarf']);
    expect(adv.actions[0]!.versions[0]).toBe('You wake in the keep of Varn.\n\nYou are an elf.\nYou are a rogue of Varn.');
    const story = createAdventureFromScenario({ ...creator(), type: 'story' }, { 'Which keep?': 'Varn' });
    expect(story.storyCards).toHaveLength(5);
    expect(story.actions[0]!.versions[0]).toBe('You wake in the keep of Varn.');
  });

  it('writes the opening with the AI Instructions as system, the brief and picks, on slot 1', async () => {
    const s = creator();
    const adv = createAdventureFromScenario(s, { 'Which keep?': 'Varn' }, undefined, ['rogue', 'elf']);
    const p = recorder('  The gate shudders.  ');
    expect(await writeOpening(openingRequest(s, adv), { provider: p, template: 'chatml' })).toBe('The gate shudders.');
    expect(p.last).toMatchObject({ slotId: 1, cachePrompt: false, maxTokens: 300 });
    expect(p.last?.prompt).toMatchInlineSnapshot(`
      "<|im_start|>system
      Narrate grimly.<|im_end|>
      <|im_start|>user
      Write the opening scene of this interactive story.

      Scenario:
      You wake in the keep of Varn.

      The player's character:
      - Race: You are an elf.
      - Class: You are a rogue of Varn.

      Story essentials:
      The keep is under siege.

      Write 2 short paragraphs in second person, present tense. End on a moment the player can act on. Never decide what the player does or says.<|im_end|>
      <|im_start|>assistant
      "
    `);
  });

  it('falls back to the opening system prompt and throws on empty output', async () => {
    const p = recorder(' \n ');
    const req = { brief: 'A ferry.', picks: [] };
    await expect(writeOpening(req, { provider: p, template: 'chatml' })).rejects.toThrow('empty opening');
    expect(p.last?.prompt).toContain('<|im_start|>system\nYou are the narrator of an interactive story.');
  });
});
