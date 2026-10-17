import type { Adventure } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult, type ScriptRunner } from '@core/ports';
import type { SessionServices } from './types';

/**
 * The session's script runner while the real one is still loading (the QuickJS
 * adapter is a lazy import). A hook that runs first awaits the load instead of
 * being skipped, so the first turn of a scripted story is scripted too.
 * A load that fails reports once and leaves the story unscripted.
 */
export class SessionScripts implements ScriptRunner {
  private ready: Promise<ScriptRunner>;
  private readonly start: (adv: Adventure) => Promise<ScriptRunner>;

  constructor(svc: SessionServices, adv: Adventure, notice: (text: string) => void) {
    this.start = (a) =>
      svc.scriptsFor(a).catch((e: unknown) => {
        notice(`Scenario scripts are off: ${e instanceof Error ? e.message : String(e)}`);
        return new NoopScriptRunner();
      });
    this.ready = this.start(adv);
  }

  /** The adventure's scripts changed: a runner is built for the scripts it opened with, so build another. */
  reload(adv: Adventure): void {
    this.dispose();
    this.ready = this.start(adv);
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
