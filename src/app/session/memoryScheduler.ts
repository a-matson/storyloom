import { entitiesOverdue, loadMemoryJobs, memoryOverdue } from '@core/memory';
import { actionText, type Adventure, type Speaker, type TemplateId } from '@core/model';
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
  /** The contradiction check's verdict on the last output; an edit or retry ends the idle period before it arrives. */
  flag: (contradiction: { actionId: string; fact: string } | null) => void;
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
    void this.checkThenRun(idle);
  }

  /** The adventure opened: portraits still missing, and cards (then portraits) for the opening's cast. */
  open(idle: AbortSignal): void {
    this.idle = idle;
    this.portraits(idle);
    void this.introduce();
  }

  private async checkThenRun(idle: AbortSignal): Promise<void> {
    await this.check(idle);
    await this.introduce();
    if (idle.aborted) return;
    if (this.typing && !this.overdue()) this.waiting = true;
    else await this.run(idle);
  }

  /** First on slot 1 so the badge comes while the player reads; typing does not cut it (a few seconds), the next turn does. */
  private async check(idle: AbortSignal): Promise<void> {
    const adv = this.host.adventure();
    const last = adv.actions.at(-1);
    if (!adv.settings.memory.contradictionCheck || (last?.type !== 'continue' && last?.type !== 'start')) return;
    try {
      const { checkInputs, checkOutput } = await loadMemoryJobs();
      const output = actionText(last);
      const lines = checkInputs(adv, output);
      if (!lines.length) return;
      const fact = await checkOutput(output, lines, { ...(await this.host.helperModel()), signal: idle });
      if (!idle.aborted) this.host.flag(fact === null ? null : { actionId: last.id, fact });
    } catch (e) {
      if (!idle.aborted) console.warn('contradiction check failed', e);
    }
  }

  /**
   * A card for each name the turn brings. Nothing cuts it: a call takes ~16 s on slot 1, longer than
   * a player reads, and a cut call never made a card. It may overlap the next turn's start.
   * [measured: 2026-10-09-live-play-m11-2c.json] One at a time; turns that end meanwhile share one re-run.
   */
  private introducing: Promise<void> | null = null;
  private introduceAgain = false;
  private introduce(): Promise<void> {
    if (this.introducing) {
      this.introduceAgain = true;
      return this.introducing;
    }
    this.introducing = (async () => {
      do {
        this.introduceAgain = false;
        await this.introduceOnce();
      } while (this.introduceAgain);
    })().finally(() => (this.introducing = null));
    return this.introducing;
  }
  private async introduceOnce(): Promise<void> {
    if (!this.host.adventure().settings.memory.introductions) return;
    try {
      const { introduce } = await loadMemoryJobs();
      const r = await introduce(this.host.adventure(), await this.host.helperModel());
      if (!r.touched) return;
      this.host.changed();
      if (this.idle && !this.idle.aborted) this.portraits(this.idle);
    } catch (e) {
      console.warn('introduction call failed', e);
    }
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

  /**
   * Started with the idle period and again once a run may have added characters. A render takes minutes and outlives its idle
   * period, so a second queue must not start beside it; a call meanwhile re-runs it for the current idle period once it ends.
   */
  private portraiting = false;
  private portraitAgain = false;
  private portraits(idle: AbortSignal): void {
    if (this.portraiting) return void (this.portraitAgain = true);
    this.portraiting = true;
    this.portraitAgain = false;
    void this.host
      .portraits(idle)
      .catch((e: unknown) => console.warn('portraits failed', e))
      .finally(() => {
        this.portraiting = false;
        if (this.portraitAgain && this.idle && !this.idle.aborted) this.portraits(this.idle);
      });
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
    const entitiesAt = this.host.adventure().scriptState.__entitiesAt;
    let progressed = false;
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
      progressed = this.host.adventure().scriptState.__entitiesAt !== entitiesAt;
    } catch (e) {
      // Background work never blocks play; it retries after the next turn.
      if (!cancel.signal.aborted) console.warn('memory maintenance failed', e);
    } finally {
      this.running = null;
    }
    if (!cancel.signal.aborted) {
      const next = this.idle;
      // An entity backlog (an import starts with no memories) drains in this idle period, not two memories a turn.
      const backlog = progressed && entitiesOverdue(this.host.adventure());
      if ((this.waiting || backlog) && next && !next.aborted && (!this.typing || this.overdue())) return this.run(next);
      return this.portraits(idle);
    }
    // Cut by typing: earlier jobs of this run may have changed the bank, and the rest waits for the input to clear.
    this.host.changed();
    this.waiting = true;
    if (!this.typing && !idle.aborted) void this.run(idle);
  }
}
