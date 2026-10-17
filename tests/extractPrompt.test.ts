import { describe, expect, it } from 'vitest';
import { mergeEntity } from '@core/memory/entities';
import { newNamesIn } from '@core/memory/fold';
import { createBlankAdventure } from '@core/model/scenario';
import { extractGrammar, grammarOf } from '@core/memory/extractJsonSchema';
import { LOOK_KEYS } from '@core/memory/looks';
import type { CompletionRequest } from '@core/ports';
import { EntityKind } from '@core/schema/entity';
import { DESCRIPTION_CHARS, extractionJson, FACT_CHARS, LOOK_CHARS, MAX_ENTITIES, PHRASE_CHARS } from '@core/schema/extraction';
import { runMemoryMaintenance } from '@core/memory/memoryJobs';
import { extractPrompt } from '@core/text/prompts';
import { statePrompt } from '@core/text/statePrompt';
import { introducePrompt } from '@core/text/turnReadPrompt';
import { ENTITY_PROMPT, fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const EXTRACT_JSON_SCHEMA = grammarOf(extractionJson([]));
const EXTRACT_GRAMMAR = extractGrammar([]);

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

  it('asks for relationships and no state: the state read writes that each turn', () => {
    for (const g of [true, false]) {
      const p = extractPrompt('[0] Mira waves.', [], g);
      expect(p).toMatch(/relationships/);
      expect(p).toMatch(/read each turn/);
      expect(p).not.toMatch(/"state"|state is|\bholder\b/);
    }
    expect(EXTRACT_JSON_SCHEMA).not.toHaveProperty('properties.entities.items.properties.state');
  });

  it('asks for the JSON on one line, grammar or not', () => {
    for (const g of [true, false]) expect(extractPrompt('[0] Mira waves.', [], g)).toMatch(/on one line, with no line breaks/);
  });

  it('sends the one-line grammar in place of the schema when the backend takes both', async () => {
    const sent = async (grammar: boolean) => {
      const adv = memoryAdventure(30);
      const reqs: CompletionRequest[] = [];
      const provider = fakeProvider(
        async function* (req) {
          if (req.prompt.includes(ENTITY_PROMPT)) reqs.push(req);
          yield { text: req.prompt.includes(ENTITY_PROMPT) ? '{"entities": []}' : 'Mira found the map.', done: true };
        },
        grammar,
        true,
      );
      await runMemoryMaintenance(adv, { ...fakeDeps(adv).deps, provider });
      return reqs[0];
    };
    expect(await sent(true)).toMatchObject({ grammar: EXTRACT_GRAMMAR, jsonSchema: undefined });
    expect(await sent(false)).toMatchObject({ grammar: undefined, jsonSchema: EXTRACT_JSON_SCHEMA });
  });

  it('keeps the schema’s caps in the grammar, with no whitespace and looks only for a character', () => {
    for (const cap of [`{0,${MAX_ENTITIES - 1}}`, `char{0,${DESCRIPTION_CHARS}}`, `char{0,${FACT_CHARS}}`, `char{0,${LOOK_CHARS}}`])
      expect(EXTRACT_GRAMMAR).toContain(cap);
    for (const k of [...LOOK_KEYS, ...EntityKind.options]) expect(EXTRACT_GRAMMAR).toContain(`"${k}`);
    expect(EXTRACT_GRAMMAR).not.toMatch(/" "|\\n|\[ \\t\]/);
    const entity = EXTRACT_GRAMMAR.split('\n').find((l) => l.startsWith('entity ::='));
    expect(entity?.split('|')[0]).toContain('looks');
    expect(entity?.split('|')[1]).not.toContain('looks');
  });

  it('asks refersTo after entities, a required phrase per name, and has no key with no character', () => {
    const g = extractGrammar(['Weever', 'Old "Nan"']);
    expect(g).toMatch(/^root ::= "\{\\"entities\\":\[".*"\],\\"refersTo\\":\{.*\},\\"events\\":\[.*\]\}"$/m);
    expect(g).toContain(String.raw`"],\"refersTo\":{\"Weever\":" phrase ",\"Old \\\"Nan\\\"\":" phrase "},\"events\":[`);
    // One phrase: no comma to list several.
    expect(g).toContain(String.raw`phrase ::= "\"" [^",\\\x7F\x00-\x1F]{0,${PHRASE_CHARS}} "\""`);
    expect(g).not.toMatch(/" "|\\n|\[ \\t\]/);
    expect(EXTRACT_GRAMMAR).not.toMatch(/refersTo|phrase/);
    expect(grammarOf(extractionJson(['Weever']))).toMatchObject({
      required: ['entities', 'refersTo', 'events'],
      properties: { refersTo: { required: ['Weever'], properties: { Weever: { maxLength: PHRASE_CHARS } } } },
    });
    expect(EXTRACT_JSON_SCHEMA).not.toHaveProperty('properties.refersTo');
    const p = extractPrompt('[0] The kobold waves.', [], true, true);
    expect(p).toMatch(
      /refersTo: for each name.*"" if none; never the name itself or a pronoun\.\nevents: .*\nReturn \{"entities": \[\.\.\.\], "refersTo": \{\.\.\.\}, "events": \[\.\.\.\]\}/s,
    );
    expect(extractPrompt('[0] The kobold waves.', [], false, true)).toContain('"refersTo": {"<Name>": "the <role>"},\n "events": [');
    expect(extractPrompt('[0] The kobold waves.', [], true)).not.toMatch(/refersTo/);
  });
});

describe('the state read’s prompt', () => {
  it('puts the P8b ask before each subject’s record and the passage, the cap after, and no effect on/off', () => {
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
    expect(p).toMatch(
      /at most four words.*\[number\] of the paragraph.*never repeat a value the record already has.*Mira: posture.*---\n\[4\] Mira sits.\n---\n\nAt most 4 entries.*If nothing changed, return \{"changes":\[\]\}/s,
    );
    expect(p).not.toMatch(/effect|<Name>/i);
    // M13-3b: awake went to mood and kneeling to location without a meaning per key.
    expect(p).toMatch(/posture = .*kneeling.*condition = .*awake.*holds = an item listed below/s);
    expect(statePrompt([], '', 2, false)).toContain('{"changes":[{"who":"<Name>"');
  });
});

describe('the helper reads’ cached prefix', () => {
  // Slot 1 reuses only an identical prefix: everything before the first variable part must not change.
  const shared = (a: string, b: string) => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  };

  it('keeps the turn read’s ask before the scene, the names and the passage', () => {
    const prev = { location: 'the ferry', present: ['Tamsin'] };
    const a = introducePrompt('[3] Tamsin rows.', [], true, prev, ['Tamsin']);
    const b = introducePrompt('[9] Brannoch waits at the gate.', ['Weever'], true, { location: 'the gate', present: ['Mira'] }, ['Mira', 'Brannoch']);
    expect(shared(a, b)).toMatch(/^Where does the passage end.*location is.*present lists.*stay gives.*weather is/s);
    expect(shared(a, b)).not.toMatch(/Previous scene|---/);
    expect(a.split('[3] Tamsin rows.')).toHaveLength(2);
  });

  it('keeps the state read’s ask before the records, the passage and the cap', () => {
    const a = statePrompt([{ who: 'Mira', now: {} }], '[4] Mira sits.', 2, true);
    const b = statePrompt([{ who: 'Tobin', now: { mood: 'calm' } }], '[8] Tobin runs.', 4, true);
    expect(shared(a, b)).toMatch(/^What changed.*Keys:.*holds = .*\n\nWho is in the scene, with their record before this passage \("you" is the player\):\n$/s);
    expect(a.split('[4] Mira sits.')).toHaveLength(2);
  });

  it('merges read B into the turn read: all asks first, the records, the passage once, then the cap', () => {
    const prev = { location: 'the ferry', present: ['Tamsin'] };
    const state = { records: [{ who: 'Tamsin', now: { mood: 'calm' } }], max: 2 };
    const p = introducePrompt('[3] Tamsin rows.', ['Weever'], true, prev, ['Tamsin'], state);
    expect(p).toMatch(
      /^changes: What changed.*Where does the passage end.*For each new name.*New here: Weever.*Previous scene.*Tamsin: mood calm\n\n---\n\[3\] Tamsin rows\.\n---\n\nchanges: for each one in the records above.*at most 2\./s,
    );
    expect(p.split('[3] Tamsin rows.')).toHaveLength(2);
    expect(p).toContain('Return {"changes": [...], "scene": {...}, "entities": [...]}.');
    expect(introducePrompt('[3] Tamsin rows.', [], false, prev, ['Tamsin'], state)).toContain('{"changes": [{"who": "<Name>"');
    expect(introducePrompt('[3] Tamsin rows.', [], true, prev, ['Tamsin'])).not.toMatch(/changes|What changed/);
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

  const names = (...texts: string[]) => {
    const adv = createBlankAdventure('T', '');
    adv.actions = texts.map((t, i) => ({ id: `a${i}`, type: 'continue' as const, versions: [t], active: 0, createdAt: 0 }));
    return newNamesIn(adv, { fromAction: texts.length - 1, toAction: texts.length });
  };

  it('needs two actions for a common word, one for a given name', () => {
    expect(names('The cat sits, Behind the bar.')).toEqual([]);
    expect(names('You wait, Behind the bar.', 'The cat sits, Behind the bar.')).toEqual(['Behind']);
    expect(names('You hand the bowl to Rose.')).toEqual(['Rose']);
  });

  it('drops a word only ever written after "the" unless a kind cue backs it', () => {
    expect(names('You lean across the Formica tabletop.', 'He taps the Formica.', 'Rain beats through the Formica.')).toEqual([]);
    expect(names('You walk the banks of the Thames.')).toEqual(['Thames']);
    expect(names('You wait for the Harrows.', 'You know the Harrows are coming.')).toEqual(['Harrows']);
    expect(names('She picks up the Amulet.')).toEqual(['Amulet']);
    expect(names('You ride with the Ashen Order and the Ashen Order rides.')).toEqual(['Ashen Order']);
  });
});
