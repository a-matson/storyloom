import { ScriptState as ScriptStateSchema } from '@core/schema';
import type { HookInput, HookResult, ScriptRunner, ScriptState } from '@core/ports';

/**
 * The script editor's test runner. One runner for the whole editor, created on
 * the first Run: QuickJS and its wasm stay off the start-up path, and the import
 * never happens inside a component (React Compiler).
 */
let runner: Promise<ScriptRunner> | undefined;

type Scripts = Parameters<ScriptRunner['load']>[0];

/** Compiles the draft's scripts and runs one hook; a compile, worker or timeout failure comes back as `error`. */
export async function testScript(scripts: Scripts, input: HookInput): Promise<HookResult> {
  const unchanged = (error: string): HookResult => ({ text: input.text, state: input.state, storyCards: input.storyCards, logs: [], error, elapsedMs: 0 });
  try {
    const r = await (runner ??= import('@adapters/scripting').then((m) => m.createQuickJsRunner()));
    const { ok, error } = await r.load(scripts);
    if (!ok) return unchanged(error ?? 'the scripts could not be compiled');
    return await r.run(input);
  } catch (e) {
    return unchanged(e instanceof Error ? e.message : String(e));
  }
}

/** The test panel's sample `state`: typed by hand, so it is parsed before a script sees it. */
export function parseScriptState(json: string): { state: ScriptState } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'not valid JSON' };
  }
  const parsed = ScriptStateSchema.safeParse(value);
  return parsed.success ? { state: parsed.data } : { error: parsed.error.issues[0]?.message ?? 'not a state object' };
}
