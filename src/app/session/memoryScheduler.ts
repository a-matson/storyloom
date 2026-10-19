import { entitiesOverdue, loadMemoryJobs, memoryOverdue, type CutCounts, type HelperCallLog } from '@core/memory';
import { actionText, type Adventure, type ReadKind, type Speaker } from '@core/model';
import type { Embedder } from '@core/ports';
import type { HelperModel } from './types';

interface Host {
  adventure: () => Adventure;
  helperModel: (read: ReadKind) => Promise<HelperModel>;
  embedder: () => Promise<Embedder>;
  /** First action of the history in the last built context: the summary covers what came before. */
  historyStart?: () => number | undefined;
  /** The adventure changed in place: publish and save. */
  changed: () => void;
  /** Speaker labels by action id, onto the log. */
  annotate: (speakers: ReadonlyMap<string, Speaker[]>) => void;
  /** Image work after the memory jobs; stops starting new renders once `idle` fires. */
  portraits: (idle: AbortSignal) => Promise<void>;
  /** The contradiction check's verdict on the last output; an edit or retry ends the idle period before it arrives. */
  flag: (contradiction: { actionId: string; fact: string } | null) => void;
  /** The helper calls one job made, for the trace drawer. */
  record?: (calls: HelperCallLog[], model: string | undefined) => void;
}

/**
 * Memory and summary jobs on slot 1, between turns. Slots share one GPU, so a job that overlaps the
 * next story request slows it: jobs wait while the player types, and the first keystroke cuts a
 * running one (it re-runs when the input clears). A memory overdue by ~3 turns, or two memories
 * still waiting for the entity call, run regardless.
 */
export class MemoryScheduler {
  typing = false;
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

  /** One helper job on the helper model, its calls recorded for the trace drawer even when it throws. */
  private async logged<T>(read: ReadKind, job: (deps: HelperModel & { cuts: CutCounts }) => Promise<T>): Promise<T> {
    const helper = await this.host.helperModel(read);
    const calls: HelperCallLog[] = [];
    try {
      return await job({ ...helper, cuts: { cutCalls: 0, finishedPastCut: 0, calls } });
    } finally {
      this.host.record?.(calls, helper.model);
    }
  }

  /** First on slot 1 so the badge comes while the player reads; typing does not cut it (a few seconds), the next turn does. */
  private async check(idle: AbortSignal): Promise<void> {
    const adv = this.host.adventure();
    const last = adv.actions.at(-1);
    if (last?.type !== 'continue' && last?.type !== 'start') return;
    try {
      const { checkInputs, checkOutput } = await loadMemoryJobs();
      const lines = checkInputs(adv);
      if (!lines.length) return;
      const fact = await this.logged('check', (d) => checkOutput(actionText(last), lines, { ...d, signal: idle }));
      if (!idle.aborted) this.host.flag(fact === null ? null : { actionId: last.id, fact });
    } catch (e) {
      if (!idle.aborted) console.warn('contradiction check failed', e);
    }
  }

  /**
   * The turn read: the scene, a card for each name the turn brings, and on `every` read B (M17-1, one call per turn). Nothing cuts it: a call takes ~16 s
   * on slot 1, longer than a player reads, and a cut call never made a card. It may overlap the next turn's start.
   * [measured: 2026-10-09-live-play-m11-2c.json] One at a time; turns that end meanwhile share one re-run.
   */
  private introducing: Promise<void> | null = null;
  /** Actions the player edited or switched since the last turn read: an older output may name someone new (F30), so each gets a read for new names. */
  private readonly edits = new Set<number>();
  edited(i: number): void {
    if (i >= 0) this.edits.add(i);
  }
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
    const { introductions, sceneEachTurn, stateRead } = this.host.adventure().settings.memory;
    let merged = false;
    try {
      if (introductions || sceneEachTurn) {
        const { introduce } = await loadMemoryJobs();
        const r = await this.logged('scene', (d) => introduce(this.host.adventure(), d, undefined, { state: stateRead === 'every' }));
        merged = r.state !== undefined;
        let touched = r.touched;
        const edits = [...this.edits];
        this.edits.clear();
        for (const i of edits) touched += (await this.logged('scene', (d) => introduce(this.host.adventure(), d, i))).touched;
        if (touched || r.sceneUpdated || (r.state?.changed ?? 0)) this.host.changed();
        if (touched && this.idle && !this.idle.aborted) this.portraits(this.idle);
      }
    } catch (e) {
      console.warn('introduction call failed', e);
    }
    // Not merged (no turn read this turn): the standalone read. A failed read is skipped: the next one anchors on the stored state.
    if (stateRead === 'every' && !merged) await this.read('readState');
    await this.read('readMeanwhile', this.idle ?? undefined, false);
  }
  /** What changed for whoever is there, or what one `returning` did meanwhile; `cancel` cuts the call, and a cut `throws` so the run waits. */
  private async read(job: 'readState' | 'readMeanwhile', cancel?: AbortSignal, throws = true): Promise<void> {
    try {
      const jobs = await loadMemoryJobs();
      if (job === 'readMeanwhile' && !jobs.returning(this.host.adventure()).length) return;
      if ((await this.logged('state', (d) => jobs[job](this.host.adventure(), { ...d, ...(cancel && { cancel }) }))).changed) this.host.changed();
    } catch (e) {
      if (cancel?.aborted && throws) throw e;
      if (!cancel?.aborted) console.warn(`${job} failed`, e);
    }
  }

  /** The client guess fills the gutter; no helper call labels speakers. */
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
      if (this.host.adventure().settings.memory.stateRead === 'idle') await this.read('readState', cancel.signal);
      // Memories are embedded on the story side so they compare with the query vectors in `prepareContext`.
      const { runMemoryMaintenance } = await loadMemoryJobs();
      const model = this.host.helperModel;
      const [memory, batch, summary] = await Promise.all([model('memory'), model('batch'), model('summary')]);
      const models = { memory, batch, summary };
      const deps = {
        ...memory,
        modelFor: (r: keyof typeof models) => models[r],
        embedder: await this.host.embedder(),
        historyStart: this.host.historyStart?.(),
      };
      const report = await runMemoryMaintenance(this.host.adventure(), { ...deps, signal: AbortSignal.any([idle, cancel.signal]), cancel: cancel.signal });
      this.host.record?.(report.calls ?? [], deps.model);
      const { summaryUpdated, summaryFirst, cutCalls, finishedPastCut, factsProposed, rejected } = report;
      const entityCalls = (report.calls ?? []).filter((c) => c.job === 'entity');
      // A live run reads these from the console: whether the summary keeps up, what typing cuts, what the entity call proposes and its guards drop.
      if (summaryUpdated || cutCalls || finishedPastCut || entityCalls.length)
        console.info(`memory run ${JSON.stringify({ summaryUpdated, summaryFirst, cutCalls, finishedPastCut, factsProposed, rejected, entityCalls })}`);
      if (report.memoriesWritten || report.memoriesRegenerated || report.memoriesDropped || report.entitiesTouched || report.summaryUpdated)
        this.host.changed();
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
