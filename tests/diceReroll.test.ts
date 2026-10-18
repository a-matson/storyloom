import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { runInSandbox, type Scripts } from '@adapters/scripting';
import { ActionLog } from '@core/log';
import { createBlankAdventure, type Adventure } from '@core/model';
import { DICE_SCRIPTS, LEGACY_DICE, PREVIOUS_DICE, diceLine, isCurrentDice, isDiceScripts } from '@core/dice';
import type { HookInput, ScriptRunner } from '@core/ports';
import { createApproxTokenizer } from '@core/text';
import { retryLast, runTurn, type TurnEvent } from '@core/turn';

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

/** Every `outcome(r, dc[, level])` for r = 1..20 from a library. */
function bands(library: string, dc: number, level?: string): string[] {
  const input = `for (let r = 1; r <= 20; r++) log(outcome(r, ${dc}, ${JSON.stringify(level)}));`;
  const out = runInSandbox(
    wasm,
    { library, input, context: '', output: '' },
    {
      hook: 'onInput',
      text: 'x',
      history: [],
      storyCards: [],
      state: {},
      info: { characterNames: [], actionCount: 0 },
    },
  );
  expect(out.error).toBeUndefined();
  return out.logs;
}

describe('the consequences level', () => {
  it.each([10, 14])('fair bands unchanged for r = 1…20, DC %i', (dc) => {
    expect(bands(DICE_SCRIPTS.library, dc, 'fair')).toEqual(bands(LEGACY_DICE.library, dc));
    expect(bands(DICE_SCRIPTS.library, dc)).toEqual(bands(LEGACY_DICE.library, dc));
  });

  it('none never fails badly', () => {
    const none = bands(DICE_SCRIPTS.library, 10, 'none');
    expect(none).not.toContain('fails badly');
    expect(new Set(none)).toEqual(new Set(['succeeds with flair', 'succeeds', 'succeeds at a cost']));
  });

  it('harsh shifts both bands by 3', () => {
    expect(bands(DICE_SCRIPTS.library, 10, 'harsh')).toEqual(bands(LEGACY_DICE.library, 13));
  });
});

const context = (retry: number | undefined, front = '[Outcome: succeeds]') =>
  runInSandbox(wasm, DICE_SCRIPTS, {
    hook: 'onModelContext',
    text: 'the prompt',
    history: [{ text: '> You climb the wall.', rawText: '> You climb the wall.', type: 'do' }],
    storyCards: [],
    state: { memory: { frontMemory: front } },
    sections: [{ kind: 'frontMemory', text: front, cacheable: false }],
    info: { characterNames: [], actionCount: 6, retry },
  });

describe('the Context hook', () => {
  it('retry 0 rolls nothing; retry 1 rolls seed actionCount + 1 into the section and front memory', () => {
    for (const r of [0, undefined]) {
      const kept = context(r);
      expect(kept.logs).toEqual([]);
      expect(kept.sections?.[0]?.text).toBe('[Outcome: succeeds]');
    }
    const input = runInSandbox(wasm, DICE_SCRIPTS, {
      hook: 'onInput',
      text: 'climb the wall',
      history: [],
      storyCards: [],
      state: {},
      info: { characterNames: [], actionCount: 6, actionType: 'do' },
    });
    const again = context(1);
    expect(again.logs).toEqual(input.logs);
    expect(again.sections?.[0]?.text).toBe(input.state.memory?.frontMemory);
    expect(again.state.memory?.frontMemory).toBe(input.state.memory?.frontMemory);
    expect(diceLine(again.logs.map((l) => `onModelContext: ${l}`))).toMatch(/^d20 \d+ vs 14 · [a-z ]+$/);
  });
});

const sandbox = (scripts: Scripts): ScriptRunner => ({
  load: () => Promise.resolve({ ok: true }),
  run: (i: HookInput) => Promise.resolve(runInSandbox(wasm, scripts, i)),
  dispose: () => {},
});

async function promptOf(gen: AsyncGenerator<TurnEvent>): Promise<string> {
  let prompt = '';
  for await (const e of gen) if (e.type === 'context') prompt = e.prompt;
  return prompt;
}

const outcomeIn = (prompt: string) => /\[Outcome: [a-z ]+\]/.exec(prompt)?.[0];

describe('a Re-roll in a turn', () => {
  it('rolls a new seed each time; a plain retry after it keeps the re-rolled outcome', async () => {
    const handler = createFakeLlama({ wordDelayMs: 0 });
    const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
    const adventure: Adventure = createBlankAdventure('Dice', 'You stand at the gate.', undefined, DICE_SCRIPTS);
    const log = new ActionLog(adventure.actions);
    const deps = { provider, tokenizer: createApproxTokenizer(), scripts: sandbox(DICE_SCRIPTS) };
    const first = outcomeIn(await promptOf(runTurn(adventure, log, { type: 'do', text: 'climb the wall' }, deps)));
    const rolled = new Set([first]);
    for (let i = 0; i < 6; i++) {
      const prompt = await promptOf(retryLast(adventure, log, deps, undefined, { reroll: true }));
      expect(outcomeIn(prompt)).toBe(adventure.scriptState.memory?.frontMemory);
      rolled.add(outcomeIn(prompt));
      expect(outcomeIn(await promptOf(retryLast(adventure, log, deps)))).toBe(outcomeIn(prompt));
    }
    expect(rolled.size).toBeGreaterThan(1);
  });
});

describe('isDiceScripts', () => {
  it('accepts the previous scripts; only the current one re-rolls', () => {
    for (const s of PREVIOUS_DICE) {
      expect(isDiceScripts(s)).toBe(true);
      expect(isCurrentDice(s)).toBe(false);
    }
    expect(isCurrentDice(DICE_SCRIPTS)).toBe(true);
  });
});
