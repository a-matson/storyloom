import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { runInSandbox } from '@adapters/scripting';
import { ActionLog } from '@core/log';
import { byPlayer } from '@core/memory/looks';
import { YOU } from '@core/memory/you';
import { createBlankAdventure, type Entity } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { retryLast, runTurn, type TurnDeps, type TurnEvent } from '@core/turn';
import { SCRIPT_EVENTS } from '@core/turn/hooks';

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

const entity = (id: string, kind: Entity['kind'], name: string): Entity => ({
  id,
  kind,
  name,
  aliases: [],
  description: '',
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});

/** An adventure with a scene and events, a runner that records every hook input and patches its result. */
function setup(reply: (i: HookInput) => Partial<HookResult> = () => ({})) {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const adventure = createBlankAdventure('Test', 'You stand at the gate.');
  adventure.entities = [entity('ent_m', 'character', 'Mira'), entity('ent_t', 'place', 'Thornfield'), entity('ent_g', 'faction', 'the Watch')];
  adventure.plot.scene = {
    location: 'ent_t',
    zone: 'the toll house',
    present: ['ent_m'],
    groups: [{ id: 'ent_g', count: 3 }],
    time: { day: 2, part: 'evening' },
  };
  adventure.assertions = Array.from({ length: SCRIPT_EVENTS + 2 }, (_, i) => byPlayer('ent_m', i, { kind: 'event', text: `Event ${i}.`, who: ['ent_m', YOU] }));
  const seen: HookInput[] = [];
  const scripts = new (class extends NoopScriptRunner {
    override async run(input: HookInput): Promise<HookResult> {
      seen.push(input);
      return { ...(await super.run(input)), ...reply(input) };
    }
  })();
  const deps: TurnDeps = { provider, tokenizer: createApproxTokenizer(), scripts };
  return { adventure, log: new ActionLog(adventure.actions), deps, seen };
}

async function collect(gen: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('state.scene and state.events', () => {
  it('reach onModelContext and onOutput with names, not ids; onInput has neither', async () => {
    const { adventure, log, deps, seen } = setup();
    await collect(runTurn(adventure, log, { type: 'do', text: 'wave' }, deps));
    const [onInput, ...rest] = seen;
    expect(onInput).toMatchObject({ hook: 'onInput', info: { actionType: 'do' } });
    expect(onInput?.scene).toBeUndefined();
    expect(onInput?.events).toBeUndefined();
    expect(rest.map((i) => i.hook)).toEqual(['onModelContext', 'onOutput']);
    for (const i of rest) {
      expect(i.scene).toEqual({
        location: 'Thornfield',
        zone: 'the toll house',
        present: ['Mira'],
        groups: [{ name: 'the Watch', count: 3 }],
        time: { day: 2, part: 'evening' },
      });
      expect(i.events).toHaveLength(SCRIPT_EVENTS);
      expect(i.events?.at(-1)).toEqual({ at: SCRIPT_EVENTS + 1, text: `Event ${SCRIPT_EVENTS + 1}.`, who: ['Mira', 'you'] });
    }
  });

  it('are frozen in the sandbox and never saved', () => {
    const context = 'state.scene.present[0] = "X"; state.scene = {}; state.events = []; ({ text: state.scene.present.join() + " " + state.events.length })';
    const out = runInSandbox(
      wasm,
      { library: '', input: '', context, output: '' },
      {
        hook: 'onModelContext',
        text: '',
        history: [],
        storyCards: [],
        state: {},
        info: { characterNames: [], actionCount: 1 },
        scene: { present: ['Mira'], groups: [] },
        events: [{ at: 0, text: 'Met.', who: ['Mira', 'you'] }],
      },
    );
    expect(out.text).toBe('Mira 1');
    expect(out.state).not.toHaveProperty('scene');
    expect(out.state).not.toHaveProperty('events');
  });
});

describe('onInput on a Continue', () => {
  it('runs with empty text and actionType continue, and its returned text is ignored', async () => {
    const { adventure, log, deps, seen } = setup((i) => (i.hook === 'onInput' ? { text: 'injected' } : {}));
    await collect(runTurn(adventure, log, { type: 'do', text: 'wave' }, deps));
    const before = log.length;
    const events = await collect(runTurn(adventure, log, { type: 'continue', text: '' }, deps));
    expect(seen.findLast((i) => i.hook === 'onInput')).toMatchObject({ text: '', info: { actionType: 'continue', actionCount: before } });
    expect(events.some((e) => e.type === 'player')).toBe(false);
    expect(log.length).toBe(before + 1);
    expect(log.actions.map((a) => a.versions[0])).not.toContain('injected');
  });

  it('stops the turn on stop', async () => {
    const { adventure, log, deps } = setup((i) => (i.hook === 'onInput' ? { stop: true } : {}));
    const events = await collect(runTurn(adventure, log, { type: 'continue', text: '' }, deps));
    expect(events.map((e) => e.type)).toEqual(['stopped']);
    expect(log.length).toBe(1);
  });

  it('is not run on a retry', async () => {
    const { adventure, log, deps, seen } = setup();
    await collect(runTurn(adventure, log, { type: 'continue', text: '' }, deps));
    seen.length = 0;
    await collect(retryLast(adventure, log, deps));
    expect(seen.map((i) => i.hook)).toEqual(['onModelContext', 'onOutput']);
  });
});
