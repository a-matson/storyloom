import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { compileScripts, runInSandbox, type SandboxInput, type SandboxOutput, type Scripts } from '@adapters/scripting';
import { loadScripts } from './fixtures/scripts/load';

/**
 * API parity against two unmodified community scripts (see each SOURCE.md).
 * A gap found here is fixed in the prelude or the port, never in the vendored
 * source: that is the whole point of running them verbatim.
 */

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

const HOOK_BUDGET_MS = 2000; // [AID-doc] the sandbox interrupt

/** Turn 1 enables the script under test; the rest name proper nouns for Auto-Cards to notice. */
const TURNS = (command: string) => [
  { input: command, output: 'Thornfield sprawls below, its lanterns burning low.' },
  { input: '> You ask after Mira Calloway.', output: 'Mira Calloway, the gatekeeper, eyes you from the toll house.' },
  { input: '> You say "Who holds the keep?"', output: '"Lord Arden holds the keep," Mira Calloway says, "and holds it badly."' },
  { input: '> You follow the road east.', output: 'The road east climbs toward Arden Keep, grey against the sky.' },
  { input: '> You rest at the waystone.', output: 'You rest. A courier passes, bound for Arden Keep.' },
  { input: '> You hail the courier.', output: 'The courier, Bram, slows. He carries a sealed writ from Lord Arden.' },
  { input: '> You ask Bram about the writ.', output: 'Bram shrugs. "A levy. Thornfield owes Lord Arden its grain."' },
  { input: '> You walk with Bram to the keep.', output: 'Arden Keep opens its gate. Bram hands over the writ.' },
  { input: '> You seek an audience with Lord Arden.', output: 'Lord Arden receives you in a cold hall. Mira Calloway is already there.' },
  { input: '> You say "Thornfield cannot pay."', output: 'Lord Arden laughs. Mira Calloway does not.' },
];

interface Play {
  runs: { hook: SandboxInput['hook']; out: SandboxOutput }[];
  state: SandboxInput['state'];
  storyCards: SandboxInput['storyCards'];
  contexts: string[];
}

/** Plays ten turns through all three hooks, carrying state and story cards the way `runHook` does. */
function play(scripts: Scripts, command: string): Play {
  const result: Play = { runs: [], state: {}, storyCards: [], contexts: [] };
  const history: SandboxInput['history'] = [];

  TURNS(command).forEach((turn, i) => {
    const step = (hook: SandboxInput['hook'], text: string): string => {
      const out = runInSandbox(wasm, scripts, {
        hook,
        text,
        history: [...history],
        storyCards: result.storyCards,
        state: result.state,
        info: { characterNames: ['Ash'], actionCount: i * 2, maxChars: 8000, memoryLength: 0 },
      });
      result.runs.push({ hook, out });
      result.state = out.state;
      result.storyCards = out.storyCards;
      return out.text ?? text;
    };

    const input = step('onInput', turn.input);
    history.push({ text: input, rawText: input, type: 'do' });
    result.contexts.push(step('onModelContext', `${history.map((a) => a.text).join('\n')}\n`));
    const output = step('onOutput', turn.output);
    history.push({ text: output, rawText: output, type: 'continue' });
  });
  return result;
}

/** Compiles, plays, and asserts the parts every script must satisfy; returns the run for per-script checks. */
function parityRun(dir: string, command: string): Play {
  const scripts = loadScripts(dir);
  expect(compileScripts(wasm, scripts)).toEqual({ ok: true });

  const run = play(scripts, command);
  expect(run.runs.filter((r) => r.out.error !== undefined).map((r) => `${r.hook}: ${r.out.error ?? ''}`)).toEqual([]);

  const slowest = Math.max(...run.runs.map((r) => r.out.elapsedMs));
  expect(slowest, `slowest hook ${slowest}ms`).toBeLessThan(HOOK_BUDGET_MS);
  // The host JSON round-trips state between turns; a script that stashed a function would already have thrown.
  expect(() => JSON.stringify(run.state)).not.toThrow();
  return run;
}

describe('community script parity', () => {
  it('runs Auto-Cards for ten turns and lets it build its control card', () => {
    const run = parityRun('auto-cards', '/AC');

    const config = run.storyCards.find((c) => c.title.includes('Auto-Cards'));
    expect(config?.entry, 'the "Configure Auto-Cards" card').toBeTruthy();
    // Its documented trigger: /AC turns it on and the setting survives in state.
    expect(JSON.stringify(run.state)).toContain('"doAC":true');
    // It owns the context: the enable turn replaces the prompt with its own notice,
    // and by turn 10 it has picked a proper noun out of the story and asked for its card.
    expect(run.contexts[1]).toContain('Auto-Cards has been enabled');
    expect(String(run.state['message'])).toContain('Generating card for');
    expect(run.contexts.some((c) => c.includes('Write a brief and coherent informational entry'))).toBe(true);
  });

  it('runs Living Meters for ten turns and injects its status directive', () => {
    const run = parityRun('living-meters', '/status');

    expect(run.storyCards.map((c) => c.title)).toContain('⚙️ Living Meters');
    // Its documented effect: resources drift every turn and reach the model as behaviour.
    const last = run.contexts[run.contexts.length - 1] ?? '';
    expect(last).toContain('never state the numbers themselves');
    const meters = JSON.parse(JSON.stringify(run.state['RM'])) as { res: Record<string, number>; turn: number };
    expect(meters.turn).toBeGreaterThan(0);
    expect(meters.res['water']).toBeLessThan(100);
    expect(String(run.state['message'])).toBeTruthy();
  });
});
