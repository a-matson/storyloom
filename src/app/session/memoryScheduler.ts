import { entitiesOverdue, loadMemoryJobs, memoryOverdue } from '@core/memory';
import type { Adventure, Speaker, TemplateId } from '@core/model';
import type { Embedder, Provider } from '@core/ports';

interface Host {
  adventure: () => Adventure;
  helperModel: () => Promise<{ provider: Provider; template: TemplateId }>;
  embedder: () => Promise<Embedder>;
  /** The adventure changed in place: publish and save. */
  changed: () => void;
  /** Speaker labels by action id, onto the log. */
  annotate: (speakers: ReadonlyMap<string, Speaker[]>) => void;
  /** Image work after the memory jobs; stops starting new renders once `idle` fires. */
  portraits: (idle: AbortSignal) => Promise<void>;
}

/**
 * Memory and summary jobs on slot 1, between turns. Slots share one GPU, so a job that overlaps the
 * next story request slows it: jobs wait while the player types, and the first keystroke cuts a
 * running one (it re-runs when the input clears). A memory overdue by ~3 turns, or two memories
 * still waiting for the entity call, run regardless.
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
    this.guessSpeakers();
    this.idle = idle;
    if (idle.aborted) return;
    // Not behind the memory run: typing cuts most of those, and a render does not use slot 1.
    this.portraits(idle);
    if (this.typing && !this.overdue()) this.waiting = true;
    else void this.run(idle);
  }

  /** The client guess fills the gutter now; the helper's attribution replaces it when its cycle reaches the turn. */
  private guessSpeakers(): void {
    loadMemoryJobs().then(
      ({ guessUnlabelled }) => this.label(guessUnlabelled(this.host.adventure())),
      (e: unknown) => console.warn('speaker guess failed', e),
    );
  }
  private label(speakers: ReadonlyMap<string, Speaker[]>): void {
    if (!speakers.size) return;
    this.host.annotate(speakers);
    this.host.changed();
  }

  /** The turn input is focused and holds text. */
  setTyping(typing: boolean): void {
    if (typing === this.typing) return;
    this.typing = typing;
    if (typing && !this.overdue()) this.running?.abort();
    else if (!typing && this.waiting && !this.running && this.idle && !this.idle.aborted) void this.run(this.idle);
  }

  /** Started with the idle period and again once a run may have added characters. A render takes minutes and outlives its idle period, so a second queue must not start beside it. */
  private portraiting = false;
  private portraits(idle: AbortSignal): void {
    if (this.portraiting) return;
    this.portraiting = true;
    void this.host
      .portraits(idle)
      .catch((e: unknown) => console.warn('portraits failed', e))
      .finally(() => (this.portraiting = false));
  }

  private overdue(): boolean {
    const adv = this.host.adventure();
    return memoryOverdue(adv.actions.length, adv.memories) || entitiesOverdue(adv);
  }

  private async run(idle: AbortSignal): Promise<void> {
    // An overdue run outlives its idle period; a second one beside it would redo its ranges on the same slot.
    if (this.running) {
      this.waiting = true;
      return;
    }
    this.waiting = false;
    const cancel = new AbortController();
    this.running = cancel;
    try {
      // Memories are embedded on the story side so they compare with the query vectors in `prepareContext`.
      const { runMemoryMaintenance } = await loadMemoryJobs();
      const deps = { ...(await this.host.helperModel()), embedder: await this.host.embedder() };
      const report = await runMemoryMaintenance(this.host.adventure(), { ...deps, signal: AbortSignal.any([idle, cancel.signal]), cancel: cancel.signal });
      if (
        report.memoriesWritten ||
        report.memoriesRegenerated ||
        report.memoriesDropped ||
        report.entitiesTouched ||
        report.sceneUpdated ||
        report.summaryUpdated
      )
        this.host.changed();
      this.label(report.speakers);
    } catch (e) {
      // Background work never blocks play; it retries after the next turn.
      if (!cancel.signal.aborted) console.warn('memory maintenance failed', e);
    } finally {
      this.running = null;
    }
    if (!cancel.signal.aborted) {
      const next = this.idle;
      if (this.waiting && next && !next.aborted && (!this.typing || this.overdue())) return this.run(next);
      return this.portraits(idle);
    }
    // Cut by typing: earlier jobs of this run may have changed the bank, and the rest waits for the input to clear.
    this.host.changed();
    this.waiting = true;
    if (!this.typing && !idle.aborted) void this.run(idle);
  }
}
