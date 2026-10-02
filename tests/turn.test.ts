import { describe, expect, it } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import { NoopScriptRunner, type CompletionRequest, type HookInput, type HookResult, type Provider } from '@core/ports';
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
    expect(events.map((e) => e.type).filter((t) => t !== 'token')).toEqual(['player', 'context', 'done', 'trace']);
    expect(events.filter((e) => e.type === 'token').length).toBeGreaterThan(3);
    const done = events.at(-2);
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
    expect(events).toEqual([{ type: 'stopped', reason: 'Unable to run scenario scripts', turnId: expect.any(String) }]);
    expect(log.length).toBe(1);
  });

  it('turns provider failures into an error event', async () => {
    const { adventure, log, deps } = setup();
    const failing: TurnDeps = { ...deps, provider: new LlamaServerProvider('x', 'http://x.invalid', () => Promise.resolve(new Response('', { status: 500 }))) };
    const events = await collect(runTurn(adventure, log, { type: 'continue', text: '' }, failing));
    expect(events.at(-2)?.type).toBe('error');
  });
});

describe('retryLast', () => {
  it('adds a new version to the last AI action', async () => {
    const { adventure, log, deps } = setup();
    await collect(runTurn(adventure, log, { type: 'do', text: 'wait' }, deps));
    const id = log.last?.id;
    const events = await collect(retryLast(adventure, log, deps));
    expect(events.at(-2)?.type).toBe('done');
    expect(log.last?.id).toBe(id);
    expect(log.last?.versions).toHaveLength(2);
    expect(log.last?.active).toBe(1);
  });

  it('refuses when the last action is not AI output', async () => {
    const { adventure, log, deps } = setup();
    log.append('do', '> You wait.');
    const events = await collect(retryLast(adventure, log, deps));
    expect(events).toEqual([{ type: 'error', message: 'Nothing to retry: the last action is not an AI output.', turnId: expect.any(String) }]);
  });
});

/** Wraps the provider so the test can see the exact request each turn sent. */
function spy(provider: Provider): { provider: Provider; seen: CompletionRequest[] } {
  const seen: CompletionRequest[] = [];
  const wrapped: Provider = {
    id: provider.id,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    health: (s) => provider.health(s),
    capabilities: () => provider.capabilities(),
    complete: (req, s) => {
      seen.push(req);
      return provider.complete(req, s);
    },
  };
  return { provider: wrapped, seen };
}

function traces(events: TurnEvent[]) {
  return events.flatMap((e) => (e.type === 'trace' ? [e.trace] : []));
}

describe('turn traces', () => {
  it('stamps one turnId on the events, both actions and a single trace', async () => {
    const { adventure, log, deps } = setup();
    const s = spy(deps.provider);
    const events = await collect(runTurn(adventure, log, { type: 'do', text: 'open the gate' }, { ...deps, provider: s.provider }));
    const [trace, ...rest] = traces(events);
    expect(rest).toEqual([]);
    expect(trace?.turnId).toBeTruthy();
    expect(trace?.kind).toBe('turn');
    expect(trace?.outcome).toBe('done');
    expect(log.actions.slice(-2).map((a) => a.turnId)).toEqual([trace?.turnId, trace?.turnId]);
    expect(events.filter((e) => e.type !== 'token' && e.type !== 'trace').every((e) => 'turnId' in e && e.turnId === trace?.turnId)).toBe(true);
    expect(trace?.actionId).toBe(log.last?.id);
    expect(trace?.sampler.seed).toBe(s.seen[0]?.seed);
    expect(trace?.sampler.stop).toEqual(s.seen[0]?.stop);
    expect(trace?.promptChars).toBeGreaterThan(0);
    expect(trace?.sections.length).toBeGreaterThan(0);
  });

  it('gives a retry its own turnId and the seed it really used', async () => {
    const { adventure, log, deps } = setup();
    const s = spy(deps.provider);
    const d = { ...deps, provider: s.provider };
    const first = traces(await collect(runTurn(adventure, log, { type: 'do', text: 'wait' }, d)))[0];
    const retry = traces(await collect(retryLast(adventure, log, d)))[0];
    expect(retry?.kind).toBe('retry');
    expect(retry?.turnId).not.toBe(first?.turnId);
    expect(retry?.actionId).toBe(first?.actionId);
    expect(retry?.sampler.seed).toBeDefined();
    expect(retry?.sampler.seed).toBe(s.seen[1]?.seed);
    expect(retry?.sampler.seed).not.toBe(first?.sampler.seed);
  });

  it('records a provider failure as an error trace', async () => {
    const { adventure, log, deps } = setup();
    const failing: TurnDeps = { ...deps, provider: new LlamaServerProvider('x', 'http://x.invalid', () => Promise.resolve(new Response('', { status: 500 }))) };
    const [trace] = traces(await collect(runTurn(adventure, log, { type: 'continue', text: '' }, failing)));
    expect(trace?.outcome).toBe('error');
    expect(trace?.errorKind).toBe('provider');
  });

  it('records a cancelled turn as stopped', async () => {
    const { adventure, log, deps } = setup();
    const ac = new AbortController();
    const out: TurnEvent[] = [];
    // A real fetch rejects once aborted; the in-memory fake just ends the stream.
    const aborting: Provider = {
      ...spy(deps.provider).provider,
      async *complete(req, s) {
        for await (const chunk of deps.provider.complete(req, s)) {
          if (s?.aborted) throw new DOMException('aborted', 'AbortError');
          yield chunk;
        }
      },
    };
    for await (const e of runTurn(adventure, log, { type: 'do', text: 'wait' }, { ...deps, provider: aborting }, ac.signal)) {
      out.push(e);
      if (e.type === 'token') ac.abort();
    }
    const [trace] = traces(out);
    expect(trace?.outcome).toBe('stopped');
    expect(trace?.errorKind).toBe('cancelled');
  });

  it('writes nothing when the turn stops before a prompt exists', async () => {
    class Stopper extends NoopScriptRunner {
      override async run(input: HookInput): Promise<HookResult> {
        return { ...(await super.run(input)), stop: true };
      }
    }
    const { adventure, log, deps } = setup(new Stopper());
    expect(traces(await collect(runTurn(adventure, log, { type: 'do', text: 'x' }, deps)))).toEqual([]);
  });
});
