import { describe, expect, it } from 'vitest';
import { exportAdventureJson, exportScenarioJson, importScenarioJson } from '@adapters/transfer';
import { createBlankAdventure, newOption, newScenario, type Scenario, type StoryCard } from '@core/model';

const card = (name: string): StoryCard => ({ id: `card_${name}`, type: 'character', name, entry: `${name} entry`, triggers: [name] });

function tree(): Scenario {
  const root: Scenario = { ...newScenario('Ferry', 'You board.'), type: 'multipleChoice', storyCards: [card('Root')] };
  const child: Scenario = { ...newOption(root), title: 'Deck', type: 'multipleChoice', storyCards: [card('Child')] };
  const grandchild: Scenario = { ...newOption(child), title: 'Bow' };
  return { ...root, options: [{ ...child, options: [grandchild] }] };
}

describe('scenario JSON', () => {
  it('round-trips with fresh ids at every depth', () => {
    const a = tree();
    const b = importScenarioJson(exportScenarioJson(a));
    expect(b.title).toBe('Ferry');
    expect(b.prompt).toBe('You board.');
    expect(b.id).not.toBe(a.id);
    expect(b.parentId).toBeUndefined();
    const child = b.options![0]!;
    const grandchild = child.options![0]!;
    expect([child.title, grandchild.title]).toEqual(['Deck', 'Bow']);
    expect(child.id).not.toBe(a.options![0]!.id);
    expect(child.parentId).toBe(b.id);
    expect(grandchild.parentId).toBe(child.id);
    expect(b.storyCards[0]!.id).not.toBe('card_Root');
    expect(child.storyCards[0]!.id).not.toBe('card_Child');
    expect(child.storyCards[0]!.entry).toBe('Child entry');
  });

  it('imports a bare scenario, twice as two scenarios', () => {
    const json = JSON.stringify(newScenario('Bare'));
    const [x, y] = [importScenarioJson(json), importScenarioJson(json)];
    expect(x.title).toBe('Bare');
    expect(x.id).not.toBe(y.id);
  });

  it('names the broken field of a damaged export', () => {
    const json = JSON.parse(exportScenarioJson(newScenario())) as { scenario: { type: string } };
    json.scenario.type = 'quiz';
    expect(() => importScenarioJson(JSON.stringify(json))).toThrow(/^Damaged Storyloom scenario: scenario\.type/);
  });

  it('rejects an adventure export', () => {
    expect(() => importScenarioJson(exportAdventureJson(createBlankAdventure('T', 'x')))).toThrow('Unrecognised scenario JSON.');
  });
});
