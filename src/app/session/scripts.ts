import type { Adventure } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult, type ScriptRunner } from '@core/ports';
import type { SessionServices } from './types';

/**
 * The session's script runner while the real one is still loading (the QuickJS
 * adapter is a lazy import). A hook that runs first awaits the load instead of
 * being skipped, so the first turn of a scripted story is scripted too.
 * A load that fails reports once and leaves the story unscripted.
 */
class PendingScripts implements ScriptRunner {
  private readonly ready: Promise<ScriptRunner>;

  constructor(load: () => Promise<ScriptRunner>, onError: (e: unknown) => void) {
    this.ready = load().catch((e: unknown) => {
      onError(e);
      return new NoopScriptRunner();
    });
  }

  async load(scripts: Parameters<ScriptRunner['load']>[0]): Promise<{ ok: boolean; error?: string | undefined }> {
    return (await this.ready).load(scripts);
  }

  async run(input: HookInput): Promise<HookResult> {
    return (await this.ready).run(input);
  }

  dispose(): void {
    void this.ready.then((r) => r.dispose());
  }
}

/** The runner an open session hands to every turn. */
export function sessionScripts(svc: SessionServices, adv: Adventure, onError: (e: unknown) => void): ScriptRunner {
  return new PendingScripts(() => svc.scriptsFor(adv), onError);
}
