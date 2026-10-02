/**
 * QuickJS sandbox runner — MILESTONE 6, NOT YET IMPLEMENTED.
 *
 * Plan:
 *  1. `pnpm add quickjs-emscripten` and create `src/scripting/sandbox.worker.ts`.
 *  2. In the worker: `newQuickJSWASMModule()`, then per scenario create a
 *     runtime with `runtime.setMemoryLimit(16 * 1024 * 1024)` and an
 *     interrupt handler that stops execution after 2 000 ms.
 *  3. Evaluate the Library script once into the context, then for each hook
 *     evaluate the hook script with `text`, `history`, `storyCards`, `state`,
 *     `info` injected as globals and `log`, `console.log`, `addStoryCard`,
 *     `updateStoryCard`, `removeStoryCard` exposed as host functions.
 *     The script's final expression `modifier(text)` returns `{ text, stop }`.
 *  4. Serialise `state` and `storyCards` back out; reject non-JSON values.
 *  5. `worker.terminate()` is the hard backstop if the interrupt never fires.
 *
 * The main-thread class below is the API the engine already calls; it just
 * needs the worker wired in.
 */
import type { HookInput, HookResult, ScriptRunner } from './types';

export class QuickJsScriptRunner implements ScriptRunner {
  async load(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'QuickJS sandbox not implemented yet (milestone 6).' };
  }
  async run(input: HookInput): Promise<HookResult> {
    return {
      text: input.text,
      state: input.state,
      storyCards: input.storyCards,
      sections: input.sections,
      logs: [],
      error: 'QuickJS sandbox not implemented yet (milestone 6).',
      elapsedMs: 0,
    };
  }
  dispose(): void {}
}
