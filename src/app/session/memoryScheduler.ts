import { loadMemoryJobs, memoryOverdue } from '@core/memory';
import type { Adventure, TemplateId } from '@core/model';
import type { Embedder, Provider } from '@core/ports';

interface Host {
  adventure: () => Adventure;
  helperModel: () => Promise<{ provider: Provider; template: TemplateId }>;
  embedder: () => Promise<Embedder>;
  /** The adventure changed in place: publish and save. */
  changed: () => void;
}

/**
 * Memory and summary jobs on slot 1, between turns. Slots share one GPU, so a job that overlaps the
 * next story request slows it: jobs wait while the player types, and the first keystroke cuts a
 * running one (it re-runs when the input clears). A memory overdue by ~3 turns runs regardless.
 */
export class MemoryScheduler {
  private typing = false;
  /** The idle period's signal; fires when the next turn or edit starts. */
  private idle: AbortSignal | null = null;
  private running: AbortController | null = null;
  private waiting = false;
  private readonly host: Host;

  constructor(host: Host) {
    this.host = host;
  }

  /** The browser is idle after a turn. */
  start(idle: AbortSignal): void {
    this.idle = idle;
    if (idle.aborted) return;
    if (this.typing && !this.overdue()) this.waiting = true;
    else void this.run(idle);
  }

  /** The turn input is focused and holds text. */
  setTyping(typing: boolean): void {
    if (typing === this.typing) return;
    this.typing = typing;
    if (typing && !this.overdue()) this.running?.abort();
    else if (!typing && this.waiting && !this.running && this.idle && !this.idle.aborted) void this.run(this.idle);
  }

  private overdue(): boolean {
    const adv = this.host.adventure();
    return memoryOverdue(adv.actions.length, adv.memories);
  }

  private async run(idle: AbortSignal): Promise<void> {
    this.waiting = false;
    const cancel = new AbortController();
    this.running = cancel;
    try {
      // Memories are embedded on the story side so they compare with the query vectors in `prepareContext`.
      const { runMemoryMaintenance } = await loadMemoryJobs();
      const deps = { ...(await this.host.helperModel()), embedder: await this.host.embedder() };
      const report = await runMemoryMaintenance(this.host.adventure(), { ...deps, signal: AbortSignal.any([idle, cancel.signal]), cancel: cancel.signal });
      if (report.memoriesWritten || report.memoriesRegenerated || report.memoriesDropped || report.summaryUpdated) this.host.changed();
    } catch (e) {
      // Background work never blocks play; it retries after the next turn.
      if (!cancel.signal.aborted) console.warn('memory maintenance failed', e);
    } finally {
      this.running = null;
    }
    if (!cancel.signal.aborted) return;
    // Cut by typing: earlier jobs of this run may have changed the bank, and the rest waits for the input to clear.
    this.host.changed();
    this.waiting = true;
    if (!this.typing && !idle.aborted) void this.run(idle);
  }
}
