import { ActionLog } from '@core/log';
import { loadMemoryJobs, markStale } from '@core/memory';
import { utilityProvider, type Adventure, type AdventureSettings, type AppSettings, type PlotComponents, type TemplateId, type TurnTrace } from '@core/model';
import type { Embedder, Provider } from '@core/ports';
import { prepareContext, retryLast, runTurn, type PlayerTurnType, type PreparedContext, type TurnDeps, type TurnEvent } from '@core/turn';
import { runIdleWork } from './idleWork';
import type { GameSnapshot, Prefetched, SessionServices } from './types';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One open adventure: action log, streaming, the last context sent, debounced persistence,
 * background memory jobs and between-turn cache warming. Framework-free; React subscribes
 * through `subscribe`/`getSnapshot`. `adv` is the working copy core turn functions mutate;
 * every emit publishes a shallow copy so snapshot identities change only when data does.
 */
export class GameSession {
  private adv: Adventure;
  private readonly log: ActionLog;
  private app: AppSettings;
  private readonly svc: SessionServices;
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private idleAbort: AbortController | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private prefetched: Prefetched | null = null;
  private lastPrompt = '';
  private lastPrepared: PreparedContext | null = null;
  /** Tokens not yet published; flushed once per frame. */
  private pending = '';
  /** The story provider's embedder; queries and memories must share it so vectors compare. */
  private embedder: Embedder | undefined;
  /** Warn once per session when the utility server is down. */
  private utilityDown = false;

  constructor(adventure: Adventure, app: AppSettings, services: SessionServices) {
    this.adv = adventure;
    this.log = new ActionLog(adventure.actions);
    this.app = app;
    this.svc = services;
    this.snapshot = this.build({ busy: false, streaming: '', context: null, error: null, notice: null, prefetchReady: false, warm: 'idle' });
    // Until it resolves, turns rank memories by recency only.
    this.resolveEmbedder().catch((e: unknown) => console.warn('no embedder; memories rank by recency', e));
  }

  // ---- store ---------------------------------------------------------------
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  readonly getSnapshot = (): GameSnapshot => this.snapshot;

  private build(rest: Omit<GameSnapshot, 'adventure' | 'actions' | 'canUndo' | 'canRedo'>): GameSnapshot {
    this.adv.actions = this.log.actions;
    return { ...rest, adventure: { ...this.adv }, actions: this.log.actions, canUndo: this.log.canUndo, canRedo: this.log.canRedo };
  }
  private emit(patch: Partial<GameSnapshot> = {}): void {
    this.snapshot = this.build({ ...this.snapshot, ...patch });
    for (const fn of this.listeners) fn();
  }

  setApp(app: AppSettings): void {
    this.app = app;
  }

  private deps(): TurnDeps {
    const provider = this.svc.providerFor(this.app, this.adv.settings.providerId);
    return { provider, tokenizer: this.svc.tokenizer, scripts: this.svc.scripts, ...(this.embedder && { embedder: this.embedder }) };
  }

  private async resolveEmbedder(): Promise<Embedder> {
    this.embedder = await this.svc.embedderFor(this.svc.providerFor(this.app, this.adv.settings.providerId));
    return this.embedder;
  }

  // ---- persistence ------------------------------------------------------------
  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), this.svc.saveDelayMs);
  }
  /** Write now; used by the debounce and on close. */
  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.adv.actions = this.log.actions;
    this.adv.updatedAt = Date.now();
    try {
      await this.svc.storage.putAdventure(this.adv);
    } catch (e) {
      this.emit({ error: `Could not save: ${message(e)}` });
    }
  }
  /** Stop background work and save; call when the adventure closes. */
  async close(): Promise<void> {
    this.abort?.abort();
    this.idleAbort?.abort();
    await this.flush();
  }

  // ---- turns ------------------------------------------------------------------
  private async drive(gen: AsyncGenerator<TurnEvent>): Promise<void> {
    this.emit({ busy: true, error: null, streaming: '' });
    let ok = false;
    try {
      for await (const evt of gen) ok = this.onEvent(evt) || ok;
    } finally {
      this.pending = '';
      this.emit({ busy: false, streaming: '' });
      this.save();
      if (ok) this.afterTurn();
    }
  }

  /** Applies one turn event; true when the turn completed. */
  private onEvent(evt: TurnEvent): boolean {
    switch (evt.type) {
      case 'player':
        this.emit();
        break;
      case 'context':
        this.lastPrompt = evt.prompt;
        this.lastPrepared = { result: evt.result, prompt: evt.prompt, stop: evt.stop };
        this.emit({ context: { result: evt.result, prompt: evt.prompt } });
        break;
      case 'token':
        // Fast backends stream faster than the screen refreshes; one render per frame is enough.
        this.pending += evt.text;
        if (this.pending === evt.text) this.svc.frame(() => this.flushTokens());
        break;
      case 'done':
        // Calibrate the heuristic tokenizer against the backend's real count (needs a non-trivial prompt).
        if ((evt.stats?.promptTokens ?? 0) > 200 && this.lastPrompt) this.svc.tokenizer.calibrate(this.lastPrompt, evt.stats?.promptTokens ?? 0);
        break;
      case 'message':
        this.emit({ notice: evt.text });
        break;
      case 'stopped':
        if (evt.reason !== 'cancelled') this.emit({ notice: evt.reason });
        break;
      case 'error':
        this.emit({ error: evt.message });
        break;
      case 'trace':
        void this.storeTrace(evt.trace);
        break;
    }
    return evt.type === 'done';
  }

  private flushTokens(): void {
    if (!this.pending) return;
    const streaming = this.snapshot.streaming + this.pending;
    this.pending = '';
    this.emit({ streaming });
  }

  private afterTurn(): void {
    const ac = new AbortController();
    this.idleAbort = ac;
    // Slots share one GPU: memory work waits for the next idle period once a turn starts.
    this.svc.idle(() => {
      if (!ac.signal.aborted) void this.maintainMemory(ac.signal);
    });
    void runIdleWork(this.adv, this.log.actions, this.lastPrepared, this.deps(), ac.signal, {
      onPrefetched: (p) => {
        this.prefetched = p;
        this.emit({ prefetchReady: true });
      },
      onWarm: (warm) => this.emit({ warm }),
    });
  }

  private async storeTrace(t: TurnTrace): Promise<void> {
    try {
      await this.svc.storage.putTrace(t);
    } catch (e) {
      // Diagnostics never block play; the next turn writes its own.
      console.warn('could not store turn trace', e);
    }
  }

  /** Utility server when configured and reachable, else the story provider; each prompted with its own template. */
  private async memoryModel(): Promise<{ provider: Provider; template: TemplateId }> {
    const utility = utilityProvider(this.app);
    if (utility) {
      const provider = this.svc.providerFor(this.app, utility.id);
      if ((await provider.health()).ok) return { provider, template: utility.template ?? this.adv.settings.template };
      if (!this.utilityDown) console.warn(`utility model at ${utility.baseUrl} is unreachable; memory jobs use the story model`);
      this.utilityDown = true;
    }
    return { provider: this.svc.providerFor(this.app, this.adv.settings.providerId), template: this.adv.settings.template };
  }

  private async maintainMemory(signal: AbortSignal): Promise<void> {
    try {
      // Memories are embedded on the story side so they compare with the query vectors in `prepareContext`.
      const { runMemoryMaintenance } = await loadMemoryJobs();
      const report = await runMemoryMaintenance(this.adv, { ...(await this.memoryModel()), embedder: await this.resolveEmbedder(), signal });
      if (report.memoriesWritten || report.memoriesRegenerated || report.memoriesDropped || report.summaryUpdated) {
        this.emit();
        this.save();
      }
    } catch (e) {
      // Background work never blocks play; it retries after the next turn.
      console.warn('memory maintenance failed', e);
    }
  }

  /** Any player action cancels background work. */
  private beginAction(): void {
    this.idleAbort?.abort();
    this.idleAbort = null;
    this.emit({ warm: 'idle', error: null });
  }
  private dropPrefetch(): void {
    this.prefetched = null;
    if (this.snapshot.prefetchReady) this.emit({ prefetchReady: false });
  }

  readonly submit = (type: PlayerTurnType | 'continue', text: string): void => {
    if (this.snapshot.busy) return;
    this.beginAction();
    this.dropPrefetch();
    this.abort = new AbortController();
    void this.drive(runTurn(this.adv, this.log, { type, text }, this.deps(), this.abort.signal));
  };

  readonly retry = (): void => {
    if (this.snapshot.busy) return;
    this.beginAction();
    const last = this.log.last;
    const pre = this.prefetched;
    this.dropPrefetch();
    if (pre && last && pre.actionId === last.id) {
      // Instant retry: the alternative was generated in the background.
      this.log.addVersion(last.id, pre.text);
      if (pre.stats) this.log.patch(last.id, { stats: pre.stats });
      void this.storeTrace(pre.trace);
      this.emit();
      this.save();
      this.afterTurn();
      return;
    }
    this.abort = new AbortController();
    void this.drive(retryLast(this.adv, this.log, this.deps(), this.abort.signal));
  };

  readonly cancel = (): void => this.abort?.abort();

  // ---- edits --------------------------------------------------------------------
  private mutate(fn: (log: ActionLog, adv: Adventure) => void): void {
    if (this.snapshot.busy) return;
    this.idleAbort?.abort();
    fn(this.log, this.adv);
    // Editing the log makes a prefetched alternative stale unless it still targets the last action.
    if (this.prefetched && this.prefetched.actionId !== this.log.last?.id) this.dropPrefetch();
    this.emit({ warm: 'idle' });
    this.save();
  }

  readonly erase = () =>
    this.mutate((log, adv) => {
      const a = log.erase();
      if (a) adv.memories = markStale(adv.memories, new Set([a.id]));
    });
  readonly eraseTo = (id: string) =>
    this.mutate((log, adv) => {
      adv.memories = markStale(adv.memories, new Set(log.eraseTo(id).map((a) => a.id)));
    });
  readonly undo = () => this.mutate((log) => log.undo());
  readonly redo = () => this.mutate((log) => log.redo());
  readonly edit = (id: string, text: string) =>
    this.mutate((log, adv) => {
      log.edit(id, text);
      adv.memories = markStale(adv.memories, new Set([id]));
    });
  readonly setVersion = (id: string, i: number) => this.mutate((log) => log.setActiveVersion(id, i));
  readonly updatePlot = (patch: Partial<PlotComponents>) => this.mutate((_, adv) => (adv.plot = { ...adv.plot, ...patch }));
  readonly updateSettings = (patch: Partial<AdventureSettings>) => this.mutate((_, adv) => (adv.settings = { ...adv.settings, ...patch }));
  readonly updateMeta = (patch: Partial<Pick<Adventure, 'title' | 'description' | 'tags'>>) => this.mutate((_, adv) => Object.assign(adv, patch));
  readonly setStoryCards = (cards: Adventure['storyCards']) => this.mutate((_, adv) => (adv.storyCards = cards));
  readonly setCardGenerator = (s: NonNullable<Adventure['cardGenerator']>) => this.mutate((_, adv) => (adv.cardGenerator = s));
  readonly clearError = () => this.emit({ error: null });
  readonly clearNotice = () => this.emit({ notice: null });

  /** Build (without sending) the context for the current log, so the viewer works before the first turn. */
  readonly previewContext = async (): Promise<void> => {
    const prepared = await prepareContext(this.adv, this.log.actions, this.deps());
    if ('stopped' in prepared) return this.emit({ notice: prepared.stopped });
    this.lastPrompt = prepared.prompt;
    this.emit({ context: { result: prepared.result, prompt: prepared.prompt } });
  };
}
