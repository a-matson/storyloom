import { beforeAll, describe, expect, it } from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { compileScripts, runInSandbox, type SandboxInput, type Scripts } from '@adapters/scripting';

let wasm: QuickJSWASMModule;
beforeAll(async () => {
  wasm = await newQuickJSWASMModuleFromVariant(variant);
});

const scripts = (over: Partial<Scripts> = {}): Scripts => ({ library: '', input: '', context: '', output: '', ...over });

const input = (over: Partial<SandboxInput> = {}): SandboxInput => ({
  hook: 'onOutput',
  text: 'the door creaks',
  history: [{ text: 'You open it', rawText: 'You open it', type: 'do' }],
  storyCards: [{ id: 'c1', keys: 'door,gate', entry: 'An oak door.', type: 'class', title: 'Oak door', description: '' }],
  state: {},
  info: { characterNames: ['Ash'], actionCount: 3 },
  ...over,
});

const run = (output: string, over: Partial<SandboxInput> = {}, lib = '') => runInSandbox(wasm, scripts({ output, library: lib }), input(over));

describe('runInSandbox', () => {
  it('passes through when the hook has no script', () => {
    const out = run('');
    expect(out).toMatchObject({ text: 'the door creaks', error: undefined, logs: [] });
  });

  it('returns the text the modifier produced', () => {
    expect(run('const modifier = (t) => ({ text: t.toUpperCase() }); modifier(text)').text).toBe('THE DOOR CREAKS');
  });

  it("stops on 'stop' and on { stop: true }", () => {
    expect(run("'stop'")).toMatchObject({ stop: true, text: 'the door creaks' });
    expect(run('({ stop: true })')).toMatchObject({ stop: true });
  });

  it('round-trips state and keeps unknown keys', () => {
    const out = run('state.count = (state.count || 0) + 1; state.message = "hi"; null', { state: { mood: 'tense' } });
    expect(out.state).toMatchObject({ mood: 'tense', count: 1, message: 'hi' });
  });

  it('edits story cards', () => {
    // addStoryCard returns the new length, not the index, and takes AID's optional title/description.
    const out = run(`
      log(addStoryCard('lantern', 'A brass lantern.', 'item'));
      log(addStoryCard('door,gate', 'duplicate', 'class'));
      updateStoryCard(0, 'door', 'An iron door.', 'class');
      removeStoryCard(1);
      null
    `);
    expect(out.error).toBeUndefined();
    expect(out.logs).toEqual(['2', 'false']);
    expect(out.storyCards).toEqual([{ id: 'c1', keys: 'door', entry: 'An iron door.', type: 'class', title: 'Oak door', description: '' }]);
  });

  it('defaults a new card title to its keys and keeps the title it is given', () => {
    const out = run(`
      addStoryCard('lantern', 'A brass lantern.', 'item');
      addStoryCard('well', 'A dry well.', 'Location', 'The Old Well', 'player notes');
      null
    `);
    expect(out.storyCards.slice(1)).toEqual([
      { id: expect.any(String), keys: 'lantern', entry: 'A brass lantern.', type: 'item', title: 'lantern', description: '' },
      { id: expect.any(String), keys: 'well', entry: 'A dry well.', type: 'Location', title: 'The Old Well', description: 'player notes' },
    ]);
  });

  it('reports a missing index to removeStoryCard as an error', () => {
    const out = run('removeStoryCard(9); null');
    expect(out.error).toContain('no card at index 9');
    expect(out.storyCards).toHaveLength(1);
  });

  it('captures log, console.log and sandboxConsole.log in order', () => {
    const out = run('log("a", 1); console.log({ b: 2 }); sandboxConsole.log("c"); null');
    expect(out.logs).toEqual(['a 1', '{"b":2}', 'c']);
  });

  it('calls a library function from the hook and keeps worldInfo as an alias', () => {
    const out = run('({ text: shout(worldInfo[0].entry) })', {}, 'function shout(s) { return s.toUpperCase(); }');
    expect(out.text).toBe('AN OAK DOOR.');
  });

  it('does not leak library top-level bindings between runs', () => {
    const lib = 'let seen = 0; seen += 1;';
    const hook = '({ text: String(seen) })';
    expect(run(hook, {}, lib).text).toBe('1');
    expect(run(hook, {}, lib).text).toBe('1');
  });

  it('interrupts an endless loop', () => {
    const started = Date.now();
    const out = run('while (true) {} null');
    expect(out.error).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('errors when the script exhausts the memory limit', () => {
    const out = run('let s = "x"; while (s.length < 32 * 1024 * 1024) s += s; ({ text: s })');
    expect(out.error).toBeTruthy();
    expect(out.text).toBe('the door creaks');
  });

  it('shows sections to onModelContext only and reads the edits back', () => {
    const context = 'sections[0].text += " and wait"; sections.push({ kind: "script", text: "iron" }); null';
    const out = runInSandbox(
      wasm,
      scripts({ context }),
      input({ hook: 'onModelContext', sections: [{ kind: 'history', text: 'You open it', cacheable: true }] }),
    );
    expect(out.error).toBeUndefined();
    expect(out.sections).toEqual([
      { kind: 'history', text: 'You open it and wait', cacheable: true },
      { kind: 'script', text: 'iron' },
    ]);
    // Other hooks are not given sections, and a run without them reports none.
    expect(run('({ text: typeof sections })').text).toBe('undefined');
    expect(runInSandbox(wasm, scripts({ context: 'null' }), input({ hook: 'onModelContext' })).sections).toBeUndefined();
  });

  it('reads state.entities but never writes them back', () => {
    const entities = [{ id: 'ent_1', kind: 'character', name: 'Tamsin', aliases: [], description: 'Rows.', facts: ['Owes a debt.'], state: {} }];
    const context = 'state.entities[0].name = "X"; state.entities = []; ({ text: state.entities[0].name + " " + state.entities.length })';
    const out = runInSandbox(wasm, scripts({ context }), input({ hook: 'onModelContext', entities }));
    expect(out.text).toBe('Tamsin 1');
    expect(out.state).not.toHaveProperty('entities');
    expect(run('({ text: String(state.entities) })').text).toBe('undefined');
  });

  it('refuses a function in state', () => {
    expect(run('state.fn = () => 1; null').error).toBe('Error: state is not JSON: state.fn');
  });
});

describe('compileScripts', () => {
  it('accepts valid scripts and rejects a syntax error', () => {
    expect(compileScripts(wasm, scripts({ output: 'modifier(text)' }))).toEqual({ ok: true });
    const bad = compileScripts(wasm, scripts({ input: 'const modifier = (t) => {' }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('input:');
  });
});
