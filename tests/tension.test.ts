import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { runInSandbox } from '@adapters/scripting';
import { renderScene } from '@core/context/render';
import { CONSEQUENCE_DICE, DICE_SCRIPTS } from '@core/dice';
import { drawComplication, pickBeat } from '@core/director';
import { indexAssertions } from '@core/memory';
import { createBlankAdventure, type Entity, type Scene } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult } from '@core/ports';
import { createApproxTokenizer, lengthLine } from '@core/text';
import { runHook } from '@core/turn/hooks';

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

describe('the scene line', () => {
  it('ends with the tension only when set', () => {
    expect(renderScene({ location: 'the mill', present: [], tension: 'action' })).toBe('the mill · Tension: action');
    expect(renderScene({ location: 'the mill', present: [] })).toBe('the mill');
  });
});

describe('the length hint', () => {
  it('is shorter in action, unchanged otherwise', () => {
    expect(lengthLine(200, 'action')).toBe('Replies run about 90 words in 1 paragraph.');
    for (const t of [undefined, 'quiet', 'tense']) expect(lengthLine(200, t)).toBe(lengthLine(200));
  });
});

const tamsin: Entity = {
  id: 'ent_t',
  kind: 'character',
  name: 'Tamsin',
  aliases: [],
  description: '',
  relations: [],
  firstSeen: 0,
  lastSeen: 1,
  beats: ['joke', 'threaten', 'leave'],
};

function beatsAt(tension: Scene['tension']): Set<string> {
  const adv = createBlankAdventure('T', 'You wake.');
  adv.entities = [tamsin];
  adv.plot = { ...adv.plot, scene: { present: ['ent_t'], ...(tension && { tension }) } };
  const ix = indexAssertions(adv.assertions);
  return new Set([0, 0.4, 0.9].map((r) => pickBeat(adv, ix, () => r)).map((p) => ('beat' in p ? p.beat : p.none)));
}

describe('pickBeat with tension', () => {
  it('only picks beats that fit the scene', () => {
    expect(beatsAt('action')).toEqual(new Set(['threaten', 'leave']));
    expect(beatsAt('quiet')).toEqual(new Set(['joke', 'leave']));
    expect(beatsAt(undefined)).toEqual(new Set(['joke', 'threaten', 'leave']));
  });
});

describe('a complication', () => {
  it("carries its card's tension, and none when the card has none", () => {
    const adv = createBlankAdventure('T', 'You wake.');
    adv.scriptState = { deck: [{ cue: 'An alarm: ', tension: 'action' }] };
    expect(drawComplication(adv)).toEqual({ cue: 'An alarm: ', tension: 'action' });
    adv.scriptState = { deck: ['A knock: '] };
    expect(drawComplication(adv)).toEqual({ cue: 'A knock: ' });
  });
});

const roll = (scripts: typeof DICE_SCRIPTS, tension?: string) =>
  runInSandbox(wasm, scripts, {
    hook: 'onInput',
    text: 'You wave.',
    history: [],
    storyCards: [],
    state: {},
    info: { characterNames: [], actionCount: 3, actionType: 'do', ...(tension && { tension }) },
  });

describe('the dice script', () => {
  it('raises the DC by 2 when tense and 4 in action', () => {
    expect(roll(DICE_SCRIPTS).logs[0]).toMatch(/ vs 10 · /);
    expect(roll(DICE_SCRIPTS, 'tense').logs[0]).toMatch(/ vs 12 · /);
    expect(roll(DICE_SCRIPTS, 'action').logs[0]).toMatch(/ vs 14 · /);
  });

  it('without a tension gives what the scripts before it did', () => {
    const { elapsedMs: _a, ...now } = roll(DICE_SCRIPTS);
    const { elapsedMs: _b, ...before } = roll(CONSEQUENCE_DICE);
    expect(now).toEqual(before);
  });
});

describe('info.tension', () => {
  it('reaches onInput, which has no state.scene', async () => {
    const seen: HookInput[] = [];
    const scripts = new (class extends NoopScriptRunner {
      override async run(input: HookInput): Promise<HookResult> {
        seen.push(input);
        return super.run(input);
      }
    })();
    const adv = createBlankAdventure('T', 'You wake.');
    adv.plot = { ...adv.plot, scene: { present: [], tension: 'tense' } };
    const provider = new LlamaServerProvider('demo', 'http://demo.invalid', () => Promise.reject(new Error('no calls')));
    const deps = { provider, tokenizer: createApproxTokenizer(), scripts };
    await runHook(adv, deps, 'onInput', '', [], { info: { characterNames: [], actionCount: 0 } });
    expect(seen[0]?.info.tension).toBe('tense');
    expect(seen[0]?.scene).toBeUndefined();
  });
});
