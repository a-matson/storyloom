import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { runInSandbox, type Scripts } from '@adapters/scripting';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import { DICE_SCRIPTS, LEGACY_DICE, isDiceScripts } from '@core/dice';
import { NoopScriptRunner, type HookInput, type ScriptRunner } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { runTurn } from '@core/turn';
import { setup, settled } from './fixtures/session';

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

const OUTCOME = /^\[Outcome: (succeeds|succeeds at a cost|fails badly)\]$/;

const input = (actionType: 'do' | 'say' | 'story' | 'see' | 'continue', text = 'climb the wall', actionCount = 5) =>
  runInSandbox(wasm, DICE_SCRIPTS, {
    hook: 'onInput',
    text,
    history: [{ text: 'You stand at the gate.', rawText: 'You stand at the gate.', type: 'start' }],
    storyCards: [],
    state: { memory: { frontMemory: '[Outcome: succeeds]' } },
    info: { characterNames: [], actionCount, actionType },
  });

const front = (out: ReturnType<typeof input>) => out.state.memory?.frontMemory;

describe('the dice script', () => {
  it('sets one outcome line on a Do, the same one for the same action count', () => {
    const out = input('do');
    expect(out.error).toBeUndefined();
    expect(out.text).toBe('climb the wall');
    expect(front(out)).toMatch(OUTCOME);
    expect(out.logs[0]).toMatch(/^d20 \d+ vs 14$/);
    expect(front(input('do'))).toBe(front(out));
  });

  it('rolls 1..20 and lands every band over a spread of turns', () => {
    const lines = new Set(Array.from({ length: 40 }, (_, i) => front(input('do', 'look around', i))));
    expect(lines).toEqual(new Set(['[Outcome: succeeds]', '[Outcome: succeeds at a cost]', '[Outcome: fails badly]']));
  });

  it.each(['say', 'story', 'see', 'continue'] as const)('clears it on %s', (type) => {
    const out = input(type, type === 'continue' ? '' : 'Open up.');
    expect(front(out)).toBe('');
    expect(out.logs).toEqual([]);
  });

  it('sets the difficulty by keyword', () => {
    expect(input('do', 'sneak past').logs[0]).toMatch(/vs 14$/);
    expect(input('do', 'open the door').logs[0]).toMatch(/vs 10$/);
  });

  it('rolls on Input for action n what the legacy Context script rolled for n + 1', () => {
    for (let n = 0; n < 20; n++) {
      const legacy = runInSandbox(wasm, LEGACY_DICE, {
        hook: 'onModelContext',
        text: 'the prompt',
        history: [{ text: '> You climb the wall.', rawText: '> You climb the wall.', type: 'do' }],
        storyCards: [],
        state: {},
        sections: [],
        info: { characterNames: [], actionCount: n + 1 },
      });
      expect(front(input('do', 'climb the wall', n))).toBe(legacy.sections?.at(-1)?.text);
    }
  });

  it('still recognises the legacy scripts', () => {
    expect(isDiceScripts(DICE_SCRIPTS)).toBe(true);
    expect(isDiceScripts(LEGACY_DICE)).toBe(true);
    expect(isDiceScripts({ ...DICE_SCRIPTS, output: 'x' })).toBe(false);
    expect(isDiceScripts(undefined)).toBe(false);
  });
});

const sandbox = (scripts: Scripts): ScriptRunner => ({
  load: () => Promise.resolve({ ok: true }),
  run: (i: HookInput) => Promise.resolve(runInSandbox(wasm, scripts, i)),
  dispose: () => {},
});

async function prompts(scripts: Scripts, turns: { type: 'do' | 'say' | 'continue'; text: string }[]): Promise<string[]> {
  const handler = createFakeLlama({ wordDelayMs: 0 });
  const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
  const adventure = createBlankAdventure('Dice', 'You stand at the gate.');
  const log = new ActionLog(adventure.actions);
  const deps = { provider, tokenizer: createApproxTokenizer(), scripts: sandbox(scripts) };
  const out: string[] = [];
  for (const t of turns) {
    for await (const e of runTurn(adventure, log, t, deps)) if (e.type === 'context') out.push(e.prompt);
  }
  return out;
}

describe('the dice in a turn', () => {
  it('sends the same prompts as the legacy script, and no outcome on a Continue after a Do', async () => {
    const turns = [
      { type: 'do', text: 'climb the wall' },
      { type: 'say', text: 'Open up.' },
      { type: 'do', text: 'open the door' },
    ] as const;
    const now = await prompts(DICE_SCRIPTS, [...turns]);
    expect(now).toEqual(await prompts(LEGACY_DICE, [...turns]));
    expect(now[0]).toMatch(/> You climb the wall\.\n\n\[Outcome: [a-z ]+\]<\|im_end\|>/);
    expect(now[1]).not.toContain('[Outcome:');
    const continued = await prompts(DICE_SCRIPTS, [...turns, { type: 'continue', text: '' }]);
    expect(continued.at(-1)).not.toContain('[Outcome:');
  });
});

describe('the dice quick start', () => {
  it('copies its scripts onto the adventure; a plain start has none', () => {
    expect(createBlankAdventure('Dice', 'You wait.', undefined, DICE_SCRIPTS).scripts).toEqual(DICE_SCRIPTS);
    expect(createBlankAdventure('Plain', 'You wait.').scripts).toBeUndefined();
  });
});

describe('GameSession.setScripts', () => {
  it('swaps the runner, so the next turn runs the new scripts, and clears the old front memory', async () => {
    const seen: string[] = [];
    const runner = (tag: string): ScriptRunner => ({
      load: () => Promise.resolve({ ok: true }),
      run: (i: HookInput) => {
        seen.push(`${tag} ${i.hook}`);
        return new NoopScriptRunner().run(i);
      },
      dispose: () => {},
    });
    const { session } = setup({ scriptsFor: (adv) => Promise.resolve(runner(adv.scripts ? 'dice' : 'none')) });
    session.getSnapshot().adventure.scriptState.memory = { frontMemory: '[Outcome: succeeds]' };
    session.setScripts(DICE_SCRIPTS);
    expect(session.getSnapshot().adventure.scripts).toEqual(DICE_SCRIPTS);
    expect(session.getSnapshot().adventure.scriptState.memory?.frontMemory).toBe('');
    session.submit('do', 'climb the wall');
    await settled(session);
    expect(seen).toContain('dice onInput');
    expect(seen.some((s) => s.startsWith('none'))).toBe(false);
  });

  it('builds a fresh runner when a closed session is opened again', async () => {
    let built = 0;
    const disposed: number[] = [];
    const { session } = setup({
      scriptsFor: () => {
        const n = ++built;
        return Promise.resolve({
          load: () => Promise.resolve({ ok: true }),
          run: (i: HookInput) => new NoopScriptRunner().run(i),
          dispose: () => disposed.push(n),
        });
      },
    });
    await session.close();
    session.open();
    session.submit('do', 'climb the wall');
    await settled(session);
    expect(built).toBe(2);
    expect(disposed).toEqual([1]);
  });
});
