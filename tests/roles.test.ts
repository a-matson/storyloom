import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { acceptRoles, MAX_ROLES } from '@core/memory/roles';
import { extractFromPassage, updateEntities } from '@core/memory/batch';
import type { CompletionRequest } from '@core/ports';
import { fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const weever = mergeEntity(undefined, { name: 'Weever', kind: 'character', description: '', aliases: ['Old Weever'] }, 0);
const minos = mergeEntity(undefined, { name: 'Minos', kind: 'character', description: '' }, 0);
const gate = mergeEntity(undefined, { name: 'Gate', kind: 'place', description: '' }, 0);
const passage = '[3] The kobold grins at the old doctor. She waves. The Gate is shut.';

function accept(refs: { phrase: string; name: string }[], entities = [weever, minos, gate]) {
  const rejected: string[] = [];
  const out = acceptRoles(entities, refs, passage, (who, phrase) => rejected.push(`${who}: ${phrase}`));
  return { roles: Object.fromEntries(out.map((e) => [e.name, e.roles])), rejected };
}

describe('acceptRoles', () => {
  it('stores a role the passage uses, lower-case', () => {
    expect(accept([{ phrase: 'The Kobold', name: 'Weever' }])).toEqual({ roles: { Weever: ['the kobold'], Minos: undefined, Gate: undefined }, rejected: [] });
  });

  it('refuses one word, a pronoun, a phrase not in the passage, a name, and a place', () => {
    const r = accept([
      { phrase: 'kobold', name: 'Weever' },
      { phrase: 'she', name: 'Weever' },
      { phrase: 'the dragon', name: 'Weever' },
      { phrase: 'Old Weever', name: 'Weever' },
      { phrase: 'the old doctor', name: 'Gate' },
    ]);
    expect(r.roles['Weever']).toBeUndefined();
    expect(r.roles['Gate']).toBeUndefined();
    expect(r.rejected).toEqual(['Weever: kobold', 'Weever: she', 'Weever: the dragon', 'Weever: old weever', 'Gate: the old doctor']);
  });

  it('drops a phrase two names claim, and one another character goes by', () => {
    expect(
      accept([
        { phrase: 'the old doctor', name: 'Weever' },
        { phrase: 'the old doctor', name: 'Minos' },
      ]).rejected,
    ).toEqual(['Weever: the old doctor', 'Minos: the old doctor']);
    const taken = accept([{ phrase: 'the kobold', name: 'Minos' }], [{ ...weever, roles: ['the kobold'] }, minos]);
    expect(taken.rejected).toEqual(['Minos: the kobold']);
  });

  it('keeps the newest four, a role seen again moving to newest', () => {
    const many = { ...weever, roles: ['the kobold', 'a b', 'a c', 'a d'] };
    expect(accept([{ phrase: 'the old doctor', name: 'Weever' }], [many]).roles['Weever']).toEqual(['a b', 'a c', 'a d', 'the old doctor']);
    expect(accept([{ phrase: 'the kobold', name: 'Weever' }], [many]).roles['Weever']).toEqual(['a b', 'a c', 'a d', 'the kobold']);
    expect(MAX_ROLES).toBe(4);
  });
});

describe('the batch call’s roles', () => {
  it('asks about the characters the passage names and stores the roles that stand', async () => {
    const adv = memoryAdventure(6);
    adv.actions = adv.actions.slice(0, 2);
    const a = adv.actions[1];
    if (a) a.versions = ['The kobold grins at Minos. Weever was always like that.'];
    const odo = mergeEntity(undefined, { name: 'Odo', kind: 'character', description: '' }, 0);
    adv.entities = [weever, minos, odo, gate];
    const reqs: CompletionRequest[] = [];
    const reply = { entities: [], refersTo: { Weever: 'the kobold', Minos: 'minotaur', Odo: 'the kobold' } };
    const provider = fakeProvider(
      async function* (req) {
        reqs.push(req);
        yield { text: JSON.stringify(reply), done: true };
      },
      true,
      true,
    );
    const r = await updateEntities(adv, { fromAction: 0, toAction: 2 }, { ...fakeDeps(adv).deps, provider });
    // Odo is not in the passage, Gate is no character: neither is asked.
    expect(reqs[0]?.grammar).toContain(String.raw`"],\"refersTo\":{\"Weever\":" phrase ",\"Minos\":" phrase "},\"events\":[`);
    expect(reqs[0]?.prompt).toMatch(/refersTo: for each name/);
    expect(adv.entities.map((e) => e.roles)).toEqual([['the kobold'], undefined, undefined, undefined]);
    expect(r.log?.rejected).toEqual([{ entity: 'Minos', value: 'minotaur', reason: 'role-rejected', passageRange: { fromAction: 0, toAction: 2 } }]);
  });

  it('counts a reply cut inside refersTo as whole entities, its last phrase unfinished', async () => {
    const cut =
      '{"entities": [{"name": "Weever", "kind": "character", "description": "A kobold.", "facts": []}], "refersTo": {"Weever": "the kobold", "Minos": "the bu';
    const provider = fakeProvider(
      async function* () {
        yield { text: cut, done: true, stats: { stopReason: 'length' } };
      },
      true,
      true,
    );
    const r = await extractFromPassage('[0] The kobold grins.', [], ['Weever', 'Minos'], { ...fakeDeps(memoryAdventure(1)).deps, provider });
    expect(r).toMatchObject({ entities: [{ name: 'Weever' }], refersTo: [{ name: 'Weever', phrase: 'the kobold' }], cut: false });
  });
});
