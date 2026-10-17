import { describe, expect, it } from 'vitest';
import { eventsOf } from '@core/memory/assertionIndex';
import { extractFromPassage, updateEntities } from '@core/memory/batch';
import { mergeEntity } from '@core/memory/entities';
import { extractGrammar } from '@core/memory/extractJsonSchema';
import { YOU } from '@core/memory/you';
import type { CompletionRequest } from '@core/ports';
import { EVENT_CHARS, MAX_EVENTS } from '@core/schema/extraction';
import { extractPrompt } from '@core/text/prompts';
import { fakeDeps, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const tamsin = mergeEntity(undefined, { name: 'Tamsin', kind: 'character', description: '' }, 0);
const odo = mergeEntity(undefined, { name: 'Odo', kind: 'character', description: '' }, 0);

/** Actions 0–2: Tamsin rows you across at 1, Odo steals the purse at 2. */
async function batch(events: unknown[], opts: { cut?: string } = {}) {
  const adv = memoryAdventure(6);
  adv.actions = adv.actions.slice(0, 3);
  const texts = ['The river is wide.', 'Tamsin rows you across. She asks for no coin.', 'Odo steals the purse. The rain stops.'];
  adv.actions.forEach((a, i) => (a.versions = [texts[i] ?? '']));
  adv.entities = [tamsin, odo];
  const reqs: CompletionRequest[] = [];
  const reply = opts.cut ?? JSON.stringify({ entities: [], refersTo: { Odo: '', Tamsin: '' }, events });
  const provider = fakeProvider(
    async function* (req) {
      reqs.push(req);
      yield { text: reply, done: true, ...(opts.cut && { stats: { stopReason: 'length' as const } }) };
    },
    true,
    true,
  );
  const r = await updateEntities(adv, { fromAction: 0, toAction: 3 }, { ...fakeDeps(adv).deps, provider });
  const stored = eventsOf(adv.assertions, tamsin.id).concat(eventsOf(adv.assertions, odo.id).filter((e) => !e.who.includes(tamsin.id)));
  return { adv, r, reqs, stored, rejected: r.log?.rejected.filter((x) => x.reason === 'event-rejected').map((x) => x.value) };
}

describe('the batch call’s events', () => {
  it('stores an event at its action, with who took part and the sentence it rests on', async () => {
    const { stored, rejected } = await batch([{ what: 'Rowed you across the river.', who: ['Tamsin', 'You'], at: 1 }]);
    expect(stored).toMatchObject([
      {
        kind: 'event',
        subject: tamsin.id,
        who: [tamsin.id, YOU],
        text: 'Rowed you across the river.',
        at: 1,
        since: 1,
        producer: 'batch',
        span: 'Tamsin rows you across.',
      },
    ]);
    expect(rejected).toEqual([]);
  });

  it('rejects an event outside the range, and one whose action names none of who took part', async () => {
    const { stored, rejected } = await batch([
      { what: 'Stole the purse.', who: ['Odo'], at: 7 },
      { what: 'Stole the purse.', who: ['Tamsin'], at: 2 },
    ]);
    expect(stored).toEqual([]);
    expect(rejected).toEqual(['Stole the purse.', 'Stole the purse.']);
  });

  it('stores an event once, however often the range is read', async () => {
    const e = { what: 'Stole the purse.', who: ['Odo'], at: 2 };
    const { adv } = await batch([e, e]);
    expect(eventsOf(adv.assertions, odo.id)).toHaveLength(1);
  });

  it('keeps all but the last event of a reply cut inside events, and the whole entities', async () => {
    const cut =
      '{"entities":[{"name":"Odo","kind":"character","description":"A thief.","facts":[]}],"refersTo":{"Odo":"","Tamsin":""},"events":[{"what":"Stole the purse.","who":["Odo"],"at":2},{"what":"Rowed y';
    const { r, stored } = await batch([], { cut });
    expect(r.reply).toMatchObject({ entities: [{ name: 'Odo' }], cut: false });
    expect(stored.map((e) => e.text)).toEqual(['Stole the purse.']);
  });

  it('asks for events last, with who as the cast and You, and at most MAX_EVENTS', async () => {
    const { reqs } = await batch([]);
    const g = reqs[0]?.grammar ?? '';
    expect(g).toContain(String.raw`",\"Odo\":" phrase "},\"events\":[" ( event ( "," event ){0,1} )? "]}"`);
    expect(g).toContain(String.raw`who ::= "\"Tamsin\"" | "\"Odo\"" | "\"You\""`);
    expect(g).toContain(`char{1,${EVENT_CHARS}}`);
    expect(MAX_EVENTS).toBe(2);
    expect(reqs[0]?.prompt).toMatch(/events: at most 2/);
  });

  it('adds a character the reply met in this range, whom the event and its action name', async () => {
    const adv = memoryAdventure(6);
    adv.actions = adv.actions.slice(0, 2);
    adv.actions.forEach(
      (a, i) => (a.versions = [['You watch Minos eat his noodles.', 'Then Minos slides a photograph across the table toward you.'][i] ?? '']),
    );
    const reply = {
      entities: [{ name: 'Minos', kind: 'character', description: 'Minos is a minotaur butcher.', facts: [] }],
      events: [{ what: 'Minos shows you a photograph.', who: ['You'], at: 1 }],
    };
    const provider = fakeProvider(
      async function* () {
        yield { text: JSON.stringify(reply), done: true };
      },
      true,
      true,
    );
    await updateEntities(adv, { fromAction: 0, toAction: 2 }, { ...fakeDeps(adv).deps, provider });
    const minos = adv.entities.find((e) => e.name === 'Minos');
    expect(eventsOf(adv.assertions, YOU).map((e) => e.who)).toEqual([[minos?.id, YOU]]);
  });

  it('lets an event with no known character name only You', async () => {
    expect(extractGrammar([])).toContain(String.raw`who ::= "\"You\""`);
    expect(extractPrompt('[0] You fall.', [], true)).toMatch(/"events": \[\.\.\.\]/);
    const provider = fakeProvider(
      async function* () {
        yield { text: '{"entities":[],"events":[{"what":"Fell.","who":["You"],"at":0}]}', done: true };
      },
      true,
      true,
    );
    const r = await extractFromPassage('[0] You fall.', [], [], { ...fakeDeps(memoryAdventure(1)).deps, provider });
    expect(r?.events).toEqual([{ what: 'Fell.', who: ['You'], at: 0 }]);
  });
});
