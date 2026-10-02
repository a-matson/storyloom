import { describe, expect, it } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { retryLast, runTurn, type TurnDeps, type TurnEvent } from '@core/turn';

function setup(scripts?: TurnDeps['scripts']) {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  const log = new ActionLog(adventure.actions);
  const deps: TurnDeps = { provider, tokenizer: createApproxTokenizer(), ...(scripts ? { scripts } : {}) };
  return { adventure, log, deps };
}

async function collect(gen: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('runTurn', () => {
  it('adds the player action, streams tokens and logs the reply', async () => {
    const { adventure, log, deps } = setup();
    const events = await collect(runTurn(adventure, log, { type: 'do', text: 'open the gate' }, deps));
    expect(events.map((e) => e.type).filter((t) => t !== 'token')).toEqual(['player', 'context', 'done']);
    expect(events.filter((e) => e.type === 'token').length).toBeGreaterThan(3);
    const done = events.at(-1);
    expect(done?.type === 'done' && done.text).toContain('Merav');
    expect(log.length).toBe(3);
    expect(adventure.actions).toBe(log.actions);
  });

  it('stops before generating when onInput asks to', async () => {
    class Stopper extends NoopScriptRunner {
      override async run(input: HookInput): Promise<HookResult> {
        return { ...(await super.run(input)), stop: true };
      }
    }
    const { adventure, log, deps } = setup(new Stopper());
    const events = await collect(runTurn(adventure, log, { type: 'do', text: 'x' }, deps));
    expect(events).toEqual([{ type: 'stopped', reason: 'Unable to run scenario scripts' }]);
    expect(log.length).toBe(1);
  });

  it('turns provider failures into an error event', async () => {
    const { adventure, log, deps } = setup();
    const failing: TurnDeps = { ...deps, provider: new LlamaServerProvider('x', 'http://x.invalid', () => Promise.resolve(new Response('', { status: 500 }))) };
    const events = await collect(runTurn(adventure, log, { type: 'continue', text: '' }, failing));
    expect(events.at(-1)?.type).toBe('error');
  });
});

describe('retryLast', () => {
  it('adds a new version to the last AI action', async () => {
    const { adventure, log, deps } = setup();
    await collect(runTurn(adventure, log, { type: 'do', text: 'wait' }, deps));
    const id = log.last?.id;
    const events = await collect(retryLast(adventure, log, deps));
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    expect(log.last?.id).toBe(id);
    expect(log.last?.versions).toHaveLength(2);
    expect(log.last?.active).toBe(1);
  });

  it('refuses when the last action is not AI output', async () => {
    const { adventure, log, deps } = setup();
    log.append('do', '> You wait.');
    const events = await collect(retryLast(adventure, log, deps));
    expect(events).toEqual([{ type: 'error', message: 'Nothing to retry: the last action is not an AI output.' }]);
  });
});
