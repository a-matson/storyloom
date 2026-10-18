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
  private ready: Promise<ScriptRunner> | undefined;
  private adv: Adventure;
  private readonly start: (adv: Adventure) => Promise<ScriptRunner>;

  constructor(svc: SessionServices, adv: Adventure, notice: (text: string) => void) {
    this.start = (a) =>
      svc.scriptsFor(a).catch((e: unknown) => {
        notice(`Scenario scripts are off: ${e instanceof Error ? e.message : String(e)}`);
        return new NoopScriptRunner();
      });
    this.adv = adv;
    this.ready = this.start(adv);
  }

  /**
   * The adventure's scripts changed: a runner is built for the scripts it opened with, so build another.
   * Front memory belongs to the scripts that set it (the dice's outcome), so it is cleared.
   */
  reload(adv: Adventure): void {
    adv.scriptState = { ...adv.scriptState, memory: { ...adv.scriptState.memory, frontMemory: '' } };
    this.dispose();
    this.adv = adv;
    this.ready = this.start(adv);
  }

  async load(scripts: Parameters<ScriptRunner['load']>[0]): Promise<{ ok: boolean; error?: string | undefined }> {
    return (await this.runner()).load(scripts);
  }

  async run(input: HookInput): Promise<HookResult> {
    return (await this.runner()).run(input);
  }

  dispose(): void {
    void this.ready?.then((r) => r.dispose());
    this.ready = undefined;
  }

  // A session closed and opened again (React's dev double effect) would otherwise post to a terminated worker.
  private runner(): Promise<ScriptRunner> {
    return (this.ready ??= this.start(this.adv));
  }
}
