import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { candidateNames, introduce } from '@core/memory/introduce';
import type { Adventure } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { ENTITY_PROMPT, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

describe('candidateNames', () => {
  it('keeps a mid-sentence capital and drops one only at a sentence start', () => {
    expect(candidateNames('You meet Tamsin at the gate. Lanterns sway.', [])).toEqual(['Tamsin']);
    expect(candidateNames('Brannoch waits. You nod to Brannoch.', [])).toEqual(['Brannoch']);
  });

  it('skips known names and aliases, the stop list and a leading stop word', () => {
    const text = 'Then Mira waves, and you see the Courier and Old Brannoch. When Night falls, They wait.';
    expect(candidateNames(text, ['mira', 'the courier', 'Courier'])).toEqual(['Old Brannoch']);
    expect(candidateNames('Rain falls. Then Oriel speaks.', [])).toEqual(['Oriel']);
  });

  it('dedupes', () => {
    expect(candidateNames('You greet Tamsin, then Tamsin again.', [])).toEqual(['Tamsin']);
  });
});

describe('introduce', () => {
  const reply = { scene: {}, entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', facts: [] }], speakers: [] };

  function setup(output: string, answer: object = reply) {
    const adv: Adventure = memoryAdventure(19);
    adv.settings.memory = { ...adv.settings.memory, introductions: true };
    const last = adv.actions.at(-1);
    if (last) last.versions = [output];
    const reqs: CompletionRequest[] = [];
    const provider = fakeProvider(
      async function* (req) {
        reqs.push(req);
        yield { text: JSON.stringify(answer), done: true };
      },
      false,
      true,
    );
    return { adv, reqs, deps: { provider, template: adv.settings.template } };
  }

  it('reads the opening once, then only the last two actions when a new name appears', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    await introduce(adv, deps);
    expect(reqs).toHaveLength(1);
    // The opening is capped at one memory span.
    const n = adv.actions.length;
    expect(reqs[0]?.prompt).toContain(`[${n - 6}]`);
    expect(reqs[0]?.prompt).not.toContain(`[${n - 7}]`);
    expect(adv.entities.map((e) => e.name)).toEqual(['Tamsin']);
    expect(adv.scriptState.__introducedAt).toBe(n);

    adv.actions.push(
      { id: 'p', type: 'do', versions: ['You wave.'], active: 0, createdAt: n },
      { id: 'o', type: 'continue', versions: ['Tamsin points at Old Brannoch.'], active: 0, createdAt: n + 1 },
    );
    await introduce(adv, deps);
    expect(reqs).toHaveLength(2);
    expect(reqs[1]?.prompt).toContain(ENTITY_PROMPT);
    expect(reqs[1]?.prompt).toContain(`[${n}] `);
    expect(reqs[1]?.prompt).toContain(`[${n + 1}] `);
    expect(reqs[1]?.prompt).not.toContain(`[${n - 1}]`);
    expect(reqs[1]?.prompt).toContain('Old Brannoch');
    expect(reqs[1]?.maxTokens).toBeGreaterThan(300);
  });

  it('makes no call without a new name, nor twice for the same text, and re-runs for a retried one', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    adv.entities = [mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '', facts: [] }, 0)];
    // The previous turn's call finished.
    const before = { ...adv.scriptState, __introducedAt: adv.actions.length - 2 };
    adv.scriptState = before;
    await introduce(adv, deps);
    expect(reqs).toHaveLength(0);

    const last = adv.actions.at(-1);
    if (!last) throw new Error('no actions');
    last.versions = ['You meet Oriel at the ferry.'];
    adv.scriptState = before;
    await introduce(adv, deps);
    await introduce(adv, deps);
    expect(reqs).toHaveLength(1);

    last.versions.push('You meet Corwin at the ferry.');
    last.active = 1;
    await introduce(adv, deps);
    expect(reqs).toHaveLength(2);
  });

  it('drops an appearance that says there is none', async () => {
    const looks = {
      ...reply,
      entities: [{ name: 'Tamsin', kind: 'character', description: 'A ferrywoman.', appearance: 'Not described in the passage.', facts: [] }],
    };
    const { adv, deps } = setup('You meet Tamsin at the ferry.', looks);
    await introduce(adv, deps);
    expect(adv.entities[0]?.appearance).toBeUndefined();
  });

  it('reads from the last finished call when the turns between were cut', async () => {
    const { adv, reqs, deps } = setup('You meet Oriel at the ferry.');
    const n = adv.actions.length;
    adv.scriptState = { ...adv.scriptState, __introducedAt: n - 4 };
    await introduce(adv, deps);
    expect(reqs[0]?.prompt).toContain(`[${n - 4}] `);
    expect(reqs[0]?.prompt).not.toContain(`[${n - 5}] `);
  });

  it('does nothing when the setting is off', async () => {
    const { adv, reqs, deps } = setup('You meet Tamsin at the ferry.');
    adv.settings.memory = { ...adv.settings.memory, introductions: false };
    await introduce(adv, deps);
    expect(reqs).toHaveLength(0);
  });

  it('leaves the marker unset when the call was cut', async () => {
    const { adv, deps } = setup('You meet Tamsin at the ferry.');
    const cancel = new AbortController();
    cancel.abort();
    await introduce(adv, { ...deps, cancel: cancel.signal });
    expect(adv.scriptState.__introducedAt).toBeUndefined();
  });
});
