import { Scope, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSHandle, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import { PRELUDE } from './prelude';
import { HookOutput, HookReturn, type SandboxInput, type SandboxOutput } from './protocol';

/** Per-run VM limits. */
const MEMORY_LIMIT = 16 * 1024 * 1024; // [AID-doc]
const STACK_LIMIT = 512 * 1024; // [provisional]
const INTERRUPT_MS = 2000; // [AID-doc]

export interface Scripts {
  library: string;
  input: string;
  context: string;
  output: string;
}

const SOURCE: Record<SandboxInput['hook'], keyof Scripts> = { onInput: 'input', onModelContext: 'context', onOutput: 'output' };
const SCRIPT_NAMES = ['library', 'input', 'context', 'output'] as const;

/** Reads the thrown value's `name`/`message` out of the VM; a thrown non-object falls back to its string form. */
function errText(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const str = (h: QuickJSHandle, key: string): string => {
    const prop = ctx.getProp(h, key);
    const value = ctx.typeof(prop) === 'string' ? ctx.getString(prop) : '';
    prop.dispose();
    return value;
  };
  if (ctx.typeof(handle) === 'object') {
    const message = str(handle, 'message');
    if (message !== '') {
      const name = str(handle, 'name');
      return `${name === '' ? 'Error' : name}: ${message}`;
    }
  }
  return ctx.typeof(handle) === 'string' ? ctx.getString(handle) : 'script error';
}

/** Evaluates in the context, disposing the handle with the scope; throws the VM error as a JS Error. */
function evalIn(ctx: QuickJSContext, scope: Scope, code: string, filename: string): QuickJSHandle {
  const r = ctx.evalCode(code, filename);
  if (r.error) {
    const message = errText(ctx, r.error);
    r.error.dispose();
    throw new Error(message);
  }
  return scope.manage(r.value);
}

function logsOf(ctx: QuickJSContext, scope: Scope): string[] {
  const r = ctx.evalCode('JSON.stringify(typeof __logs === "undefined" ? [] : __logs)');
  if (r.error) {
    r.error.dispose();
    return [];
  }
  const parsed: unknown = JSON.parse(ctx.getString(scope.manage(r.value)));
  return Array.isArray(parsed) ? parsed.filter((l): l is string => typeof l === 'string') : [];
}

function normalise(
  result: unknown,
  input: SandboxInput,
  out: { state: SandboxOutput['state']; storyCards: SandboxOutput['storyCards']; sections: SandboxOutput['sections']; logs: string[] },
  elapsedMs: number,
): SandboxOutput {
  const base = { state: out.state, storyCards: out.storyCards, ...(out.sections ? { sections: out.sections } : {}), logs: out.logs, elapsedMs };
  if (result === 'stop') return { ...base, text: input.text, stop: true };
  const r = HookReturn.safeParse(result);
  if (!r.success) return { ...base, text: input.text };
  return { ...base, text: r.data.text ?? input.text, stop: r.data.stop === true ? true : undefined };
}

const passThrough = (input: SandboxInput, elapsedMs: number, error?: string): SandboxOutput => ({
  text: input.text,
  state: input.state,
  storyCards: input.storyCards,
  logs: [],
  error,
  elapsedMs,
});

/**
 * Runs one hook in a fresh runtime and context. Pure and worker-free, so tests
 * exercise the real wasm in node.
 *
 * The library is re-evaluated every run (AID prepends it to each hook), which
 * also means top-level bindings never leak between turns. [provisional]
 */
export function runInSandbox(module: QuickJSWASMModule, scripts: Scripts, input: SandboxInput): SandboxOutput {
  const started = Date.now();
  const code = scripts[SOURCE[input.hook]];
  if (!code.trim()) return passThrough(input, 0);
  let logs: string[] = [];
  try {
    return Scope.withScope((scope) => {
      const runtime = scope.manage(module.newRuntime());
      runtime.setMemoryLimit(MEMORY_LIMIT);
      runtime.setMaxStackSize(STACK_LIMIT);
      runtime.setInterruptHandler(shouldInterruptAfterDeadline(started + INTERRUPT_MS));
      const ctx = scope.manage(runtime.newContext());
      try {
        // One JSON.parse of one string: no host functions, so the VM never calls back out mid-run.
        evalIn(ctx, scope, `globalThis.__in = JSON.parse(${JSON.stringify(JSON.stringify(input))})`, 'input.json');
        evalIn(ctx, scope, PRELUDE, 'prelude.js');
        // One program, like AID: the library is prepended, so its top-level
        // `let`/`const` are in scope for the hook. evalCode returns the
        // completion value, i.e. the script's closing `modifier(text)`.
        const value = evalIn(ctx, scope, `${scripts.library}\n;\n${code}`, `${input.hook}.js`);
        logs = logsOf(ctx, scope);
        const outFn = scope.manage(ctx.getProp(ctx.global, '__out'));
        const call = ctx.callFunction(outFn, ctx.undefined, value);
        if (call.error) {
          const message = errText(ctx, call.error);
          call.error.dispose();
          throw new Error(message);
        }
        const out = HookOutput.parse(JSON.parse(ctx.getString(scope.manage(call.value))));
        return normalise(
          out.result,
          input,
          { state: out.state, storyCards: out.storyCards, sections: out.sections ?? undefined, logs: out.logs },
          Date.now() - started,
        );
      } catch (e) {
        logs = logs.length ? logs : logsOf(ctx, scope);
        throw e;
      }
    });
  } catch (e) {
    return { ...passThrough(input, Date.now() - started, e instanceof Error ? e.message : String(e)), logs };
  }
}

/** Compiles each script once to surface syntax errors before play starts. */
export function compileScripts(module: QuickJSWASMModule, scripts: Scripts): { ok: boolean; error?: string } {
  return Scope.withScope((scope) => {
    const runtime = scope.manage(module.newRuntime());
    const ctx = scope.manage(runtime.newContext());
    for (const name of SCRIPT_NAMES) {
      const code = scripts[name];
      if (code.trim() === '') continue;
      const r = ctx.evalCode(code, `${name}.js`, { compileOnly: true });
      if (r.error !== undefined) {
        const error = `${name}: ${errText(ctx, r.error)}`;
        r.error.dispose();
        return { ok: false, error };
      }
      r.value.dispose();
    }
    return { ok: true };
  });
}
