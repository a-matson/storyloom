import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { newNamesIn } from '@core/memory/fold';
import { createBlankAdventure } from '@core/model/scenario';
import { EXTRACT_JSON_SCHEMA } from '@core/memory/extractJsonSchema';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { extractPrompt, statePrompt } from '@core/text/prompts';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

describe('the entity call’s prompt', () => {
  it('shows a worked example only when no grammar carries the shape', () => {
    expect(extractPrompt('[0] Mira waves.', [], true)).not.toMatch(/<Name>|Ysolde/);
    expect(extractPrompt('[0] Mira waves.', [], false)).toMatch(/"looks": \{"<key>": "<a few words>"\}/);
    expect(extractPrompt('[0] Mira waves.', [], false)).not.toMatch(/Ysolde|Brass Owl|timeDelta|cards|New here/);
  });

  it('asks for no rules: they took the reply to its cap', () => {
    for (const g of [true, false]) expect(extractPrompt('[0] Mira waves.', [], g)).not.toMatch(/rules/);
    expect(EXTRACT_JSON_SCHEMA).not.toHaveProperty('properties.rules');
  });

  it('logs each helper call with its raw reply', async () => {
    const adv = memoryAdventure(30);
    const provider = fakeProvider(
      async function* (req) {
        yield { text: req.prompt.includes(ENTITY_PROMPT) ? '{"entities": [], "speakers": []}' : 'Mira found the map.', done: true };
      },
      false,
      true,
    );
    const report = await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
    expect(report.calls?.find((c) => c.job === 'entity')?.reply).toBe('{"entities": [], "speakers": []}');
  });

  it('asks for the JSON on one line, grammar or not', () => {
    for (const g of [true, false]) expect(extractPrompt('[0] Mira waves.', [], g)).toMatch(/on one line, with no line breaks/);
  });
});

describe('the state read’s prompt', () => {
  it('lists each subject’s current record, the passage, then the P8b ask, and no effect on/off', () => {
    const p = statePrompt(
      [
        { who: 'Mira', now: { posture: 'standing', holds: 'Horn' } },
        { who: 'you', now: {} },
      ],
      '[4] Mira sits.',
      4,
      true,
    );
    expect(p).toContain('Mira: posture standing; holds Horn\nyou: nothing yet');
    expect(p).toContain('---\n[4] Mira sits.\n---');
    expect(p).toMatch(/At most 4 entries.*at most four words.*\[number\] of the paragraph.*no longer true at the end; skip values that did not change/s);
    expect(p).not.toMatch(/effect|<Name>/i);
    expect(statePrompt([], '', 2, false)).toContain('{"changes":[{"who":"<Name>"');
  });
});

describe('newNamesIn', () => {
  it('leaves out a part of a longer new name or of a known one, and keeps a possessive inside a name', () => {
    const adv = createBlankAdventure('T', '');
    adv.actions = [
      {
        id: 'a0',
        type: 'continue',
        versions: ["You wave and Mira waves back; Old Brannoch nods, Brannoch smiles, the Ashen Order rides to Deadman's Gulch, and Mira's dog barks."],
        active: 0,
        createdAt: 0,
      },
    ];
    adv.entities = [mergeEntity(undefined, { name: 'The Ashen Order', kind: 'faction', description: '' }, 0)];
    expect(newNamesIn(adv, { fromAction: 0, toAction: 1 })).toEqual(['Mira', 'Old Brannoch', "Deadman's Gulch"]);
  });
});
