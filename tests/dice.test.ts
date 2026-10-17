import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { runInSandbox, type SandboxInput } from '@adapters/scripting';
import { createBlankAdventure } from '@core/model';
import { DICE_SCRIPTS } from '@core/dice';
import { NoopScriptRunner, type HookInput, type ScriptRunner } from '@core/ports';
import { setup, settled } from './fixtures/session';

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

const OUTCOME = /^\[Outcome: (succeeds|succeeds at a cost|fails badly)\]$/;

const context = (last: SandboxInput['history'][number], actionCount = 5) =>
  runInSandbox(wasm, DICE_SCRIPTS, {
    hook: 'onModelContext',
    text: 'the prompt',
    history: [{ text: 'You stand at the gate.', rawText: 'You stand at the gate.', type: 'start' }, last],
    storyCards: [],
    state: {},
    sections: [{ kind: 'lastAction', text: last.text, cacheable: false }],
    info: { characterNames: [], actionCount },
  });

const act = (type: 'do' | 'say', text: string) => ({ text, rawText: text, type });

describe('the dice script', () => {
  it('adds one outcome line after a Do, the same one for the same action count', () => {
    const out = context(act('do', '> You climb the wall.'));
    expect(out.error).toBeUndefined();
    expect(out.text).toBe('the prompt');
    expect(out.sections?.at(-1)?.kind).toBe('frontMemory');
    expect(out.sections?.at(-1)?.text).toMatch(OUTCOME);
    expect(out.logs[0]).toMatch(/^d20 \d+ vs 14$/);
    expect(context(act('do', '> You climb the wall.')).sections).toEqual(out.sections);
  });

  it('rolls 1..20 and lands every band over a spread of turns', () => {
    const lines = new Set(Array.from({ length: 40 }, (_, i) => context(act('do', '> You look around.'), i).sections?.at(-1)?.text));
    expect(lines).toEqual(new Set(['[Outcome: succeeds]', '[Outcome: succeeds at a cost]', '[Outcome: fails badly]']));
  });

  it('leaves a Say turn alone', () => {
    const out = context(act('say', '> You say "Open up."'));
    expect(out.sections).toEqual([{ kind: 'lastAction', text: '> You say "Open up."', cacheable: false }]);
    expect(out.logs).toEqual([]);
  });

  it('sets the difficulty by keyword', () => {
    expect(context(act('do', '> You sneak past.')).logs[0]).toMatch(/vs 14$/);
    expect(context(act('do', '> You open the door.')).logs[0]).toMatch(/vs 10$/);
  });
});

describe('the dice quick start', () => {
  it('copies its scripts onto the adventure; a plain start has none', () => {
    expect(createBlankAdventure('Dice', 'You wait.', undefined, DICE_SCRIPTS).scripts).toEqual(DICE_SCRIPTS);
    expect(createBlankAdventure('Plain', 'You wait.').scripts).toBeUndefined();
  });
});

describe('GameSession.setScripts', () => {
  it('swaps the runner, so the next turn runs the new scripts', async () => {
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
    session.setScripts(DICE_SCRIPTS);
    expect(session.getSnapshot().adventure.scripts).toEqual(DICE_SCRIPTS);
    session.submit('do', 'climb the wall');
    await settled(session);
    expect(seen).toContain('dice onModelContext');
    expect(seen.some((s) => s.startsWith('none'))).toBe(false);
  });
});
