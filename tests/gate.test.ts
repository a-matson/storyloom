import { describe, expect, it } from 'vitest';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import type { CompletionChunk, CompletionRequest, Provider } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { runTurn, type TurnEvent } from '@core/turn';
import { gateOutput } from '@core/turn/gate';

const OPENING =
  'The rain hammers the tin roof of the ferry house while the old woman counts coins by lamplight. She does not look up when you come in, but her hand stops over the copper pile and she asks where you mean to cross tonight.';
const FRESH = 'The ferrywoman pockets the coins and leads you down to the black water, where the boat waits tied to a rotten post.';
const second = { playerType: 'do' as const, thirdPerson: false };

describe('gateOutput', () => {
  it('flags an empty reply', () => {
    expect(gateOutput('  \n', [], second)).toBe('empty');
  });

  it('flags a copied paragraph but not a shared stock phrase', () => {
    expect(gateOutput(`${OPENING} The lamp gutters.`, [OPENING], second)).toBe('verbatim');
    expect(
      gateOutput('You take a deep breath. The boat rocks under you as the current pulls it out.', ['You take a deep breath and step inside the hall.'], second),
    ).toBeUndefined();
  });

  it('only looks at the last ten outputs', () => {
    const older = [OPENING, ...Array.from({ length: 10 }, (_, i) => `Filler passage number ${i} about something else entirely.`)];
    // OPENING is 11 back here, 10 back once the last filler is gone.
    expect(gateOutput(OPENING, older, second)).toBeUndefined();
    expect(gateOutput(OPENING, older.slice(0, 10), second)).toBe('verbatim');
  });

  it('flags the model writing the player', () => {
    expect(gateOutput('She nods.\n> You open the door', [], second)).toBe('agency');
    expect(gateOutput('You say "fine." She shrugs.', [], second)).toBe('agency');
    // A character quoting the player inside dialogue is not the player speaking.
    expect(gateOutput('"You say that," she says, "but you never pay."', [], second)).toBeUndefined();
  });

  it('skips agency after continue or story, and in third person', () => {
    const text = '> You open the door';
    expect(gateOutput(text, [], { playerType: 'continue', thirdPerson: false })).toBeUndefined();
    expect(gateOutput(text, [], { playerType: 'story', thirdPerson: false })).toBeUndefined();
    expect(gateOutput(text, [], { playerType: 'do', thirdPerson: true })).toBeUndefined();
  });
});

/** Answers each call with the next of `replies` and keeps the prompts. */
function replying(replies: string[]) {
  const prompts: string[] = [];
  const provider: Provider = {
    id: 'fake',
    kind: 'fake',
    baseUrl: 'http://fake',
    health: () => Promise.resolve({ ok: true }),
    capabilities: () => Promise.reject(new Error('unused')),
    async *complete(req: CompletionRequest): AsyncIterable<CompletionChunk> {
      prompts.push(req.prompt);
      yield { text: replies[prompts.length - 1] ?? FRESH, done: false };
      // `length`, so the reply is not continued as one that stopped short.
      yield { text: '', done: true, stats: { stopReason: 'length' } };
    },
  };
  return { provider, prompts };
}

async function play(replies: string[], autoRetry = true) {
  const { provider, prompts } = replying(replies);
  const adventure = createBlankAdventure('Test', OPENING);
  adventure.settings.model.autoRetry = autoRetry;
  const log = new ActionLog(adventure.actions);
  const events: TurnEvent[] = [];
  for await (const e of runTurn(adventure, log, { type: 'do', text: 'pay the ferrywoman' }, { provider, tokenizer: createApproxTokenizer() })) events.push(e);
  const trace = events.find((e) => e.type === 'trace');
  return { log, prompts, types: events.map((e) => e.type).filter((t) => t !== 'token'), trace: trace?.type === 'trace' ? trace.trace : undefined };
}

describe('runTurn output gate', () => {
  it('re-rolls a copied reply once, keeping the copy in the retry stack', async () => {
    const { log, prompts, types, trace } = await play([OPENING, FRESH]);
    expect(log.last?.versions).toEqual([OPENING, FRESH]);
    expect(log.last?.active).toBe(1);
    expect(trace?.gate).toEqual({ reason: 'verbatim', retried: true });
    expect(prompts[0]).not.toContain('Do not repeat an earlier passage.');
    expect(prompts[1]).toContain('[Note: keep to this: Do not repeat an earlier passage.]');
    expect(types).toEqual(['player', 'context', 'regenerate', 'context', 'done', 'trace']);
  });

  it('only records the flag when auto-retry is off', async () => {
    const off = await play([OPENING], false);
    expect(off.log.last?.versions).toEqual([OPENING]);
    expect(off.trace?.gate).toEqual({ reason: 'verbatim', retried: false });
    expect(off.prompts).toHaveLength(1);
  });

  it('never re-rolls twice in one turn', async () => {
    const { log, prompts } = await play([OPENING, OPENING]);
    expect(prompts).toHaveLength(2);
    expect(log.last?.versions).toHaveLength(2);
  });

  it('leaves a clean reply alone', async () => {
    const { log, prompts, trace } = await play([FRESH]);
    expect(prompts).toHaveLength(1);
    expect(log.last?.versions).toEqual([FRESH]);
    expect(trace?.gate).toBeUndefined();
  });
});
