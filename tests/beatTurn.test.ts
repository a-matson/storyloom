import { describe, expect, it } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { cueFor } from '@core/director';
import { ActionLog } from '@core/log';
import { actionText, createBlankAdventure } from '@core/model';
import { createApproxTokenizer } from '@core/text';
import { generateAlternative, prepareContext, retryLast, runTurn, type PreparedContext, type TurnDeps, type TurnEvent } from '@core/turn';

const CUE = cueFor('interrupt', 'Tamsin');

function setup() {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const prompts: string[] = [];
  const complete = provider.complete.bind(provider);
  provider.complete = (req, signal) => (prompts.push(req.prompt), complete(req, signal));
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = [{ id: 'ent_t', kind: 'character', name: 'Tamsin', aliases: [], description: '', relations: [], firstSeen: 0, lastSeen: 1 }];
  const deps: TurnDeps = { provider, tokenizer: createApproxTokenizer() };
  return { adventure, log: new ActionLog(adventure.actions), deps, prompts };
}

async function collect(gen: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('a beat turn', () => {
  it('sends the prompt ending in the cue, streams the cue first and logs cue + reply, no player action', async () => {
    const { adventure, log, deps, prompts } = setup();
    const events = await collect(runTurn(adventure, log, { type: 'continue', text: '', cue: CUE }, deps));
    expect(prompts[0]?.endsWith(CUE)).toBe(true);
    expect(events.find((e) => e.type === 'token')).toEqual({ type: 'token', text: CUE });
    expect(events.find((e) => e.type === 'context')).toMatchObject({ cue: CUE });
    expect(log.length).toBe(2);
    const text = actionText(log.last!);
    expect(text.startsWith(CUE)).toBe(true);
    expect(text.length).toBeGreaterThan(CUE.length);
    expect(log.actions.some((a) => a.type === 'do' || a.type === 'say')).toBe(false);
  });

  it('a Retry of it re-sends the same cue; a plain reply retries without one', async () => {
    const { adventure, log, deps, prompts } = setup();
    await collect(runTurn(adventure, log, { type: 'continue', text: '', cue: CUE }, deps));
    await collect(retryLast(adventure, log, deps));
    expect(prompts.at(-1)?.endsWith(CUE)).toBe(true);
    expect(log.last?.versions).toHaveLength(2);
    expect(actionText(log.last!).startsWith(CUE)).toBe(true);

    log.append('continue', 'Tamsin looks away.');
    await collect(retryLast(adventure, log, deps));
    expect(prompts.at(-1)?.endsWith(CUE)).toBe(false);
  });

  it('a Retry of a complication re-sends its deck cue', async () => {
    const { adventure, log, deps, prompts } = setup();
    const cue = 'The weather turns: ';
    await collect(runTurn(adventure, log, { type: 'continue', text: '', cue }, deps));
    await collect(retryLast(adventure, log, deps));
    expect(prompts.at(-1)?.endsWith(cue)).toBe(true);
    expect(actionText(log.last!).startsWith(cue)).toBe(true);
  });

  it('without a cue the prompt is the one prepareContext renders, byte for byte', async () => {
    const { adventure, log, deps, prompts } = setup();
    const expected = await prepareContext(adventure, log.actions, deps);
    await collect(runTurn(adventure, log, { type: 'continue', text: '' }, deps));
    expect('prompt' in expected && expected.prompt).toBe(prompts[0]);
  });

  it('the prefetched alternative opens with the cue too', async () => {
    const { adventure, log, deps } = setup();
    const events = await collect(runTurn(adventure, log, { type: 'continue', text: '', cue: CUE }, deps));
    const ctx = events.find((e): e is Extract<TurnEvent, { type: 'context' }> => e.type === 'context')!;
    const prepared: PreparedContext = { result: ctx.result, prompt: ctx.prompt, stop: ctx.stop, cue: ctx.cue };
    const alt = await generateAlternative(adventure, prepared, deps, log.last!.id);
    expect(alt.text.startsWith(CUE)).toBe(true);
  });
});
