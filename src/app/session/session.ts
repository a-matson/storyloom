import { ownedBlobIds, type Block } from '@core/image';
import { ActionLog } from '@core/log';
import { followLog, linkCards, withPresence } from '@core/memory';
import type { Adventure, AdventureSettings, AppSettings, PlotComponents, ReadKind, TurnTrace } from '@core/model';
import type { Embedder } from '@core/ports';
import { prepareContext, retryLast, runTurn, type PlayerTurnType, type PreparedContext, type TurnDeps, type TurnEvent } from '@core/turn';
import { helperModels } from './helperModel';
import { IdleWork } from './idleWork';
import type * as SeeMode from './images';
import { MemoryScheduler } from './memoryScheduler';
import { SaveQueue } from './saveQueue';
import { SessionScripts } from './scripts';
import { OPENED, type GameSnapshot, type HelperModel, type Prefetched, type SessionServices } from './types';

/**
 * One open adventure: action log, streaming, the last context sent, debounced persistence,
 * background memory jobs and between-turn cache warming. Framework-free; React subscribes
 * through `subscribe`/`getSnapshot`. `adv` is the working copy core turn functions mutate;
 * every emit publishes a shallow copy so snapshot identities change only when data does.
 */
export class GameSession {
  // Readable from outside only because the session passes itself to the `see` helpers as their host.
  readonly adv: Adventure;
  readonly log: ActionLog;
  app: AppSettings;
  readonly svc: SessionServices;
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private readonly saves = new SaveQueue({
    adventure: () => ((this.adv.actions = this.log.actions), this.adv),
    delayMs: () => this.svc.saveDelayMs,
    write: (a) => this.svc.storage.putAdventure(a),
    onError: (m) => this.emit({ error: `Could not save: ${m}` }),
  });
  private prefetched: Prefetched | null = null;
  private lastPrompt = '';
  private lastPrepared: PreparedContext | null = null;
  /** Tokens not yet published; flushed once per frame. */
  private pending = '';
  /** The story provider's embedder; queries and memories must share it so vectors compare. */
  private embedder: Embedder | undefined;
  private contextSize: number | undefined;
  private readonly scripts: SessionScripts;
  private readonly memory = new MemoryScheduler({
    adventure: () => this.adv,
    helperModel: (read) => this.helperModel(read),
    embedder: () => this.resolveEmbedder(),
    historyStart: () => this.lastPrepared?.result.historyRange?.from,
    changed: () => this.changed(),
    annotate: (s) => this.log.annotate(s),
    portraits: async (idle) => (await import('./portraits')).queuePortraits(this, idle),
    flag: (contradiction) => this.emit({ contradiction }),
    // Loaded on first use: start-up bundle budget.
    record: (calls, model) =>
      void import('./helperCalls').then(
        ({ recordHelperCalls }) => recordHelperCalls(this.svc.storage, this.adv, calls, model),
        (e: unknown) => console.warn('could not store helper calls', e),
      ),
  });
  private readonly idleWork = new IdleWork({
    adventure: () => this.adv,
    actions: () => this.log.actions,
    deps: () => this.deps(),
    busy: () => this.snapshot.busy,
    delayMs: () => this.svc.rewarmDelayMs,
    onPrefetched: (p) => ((this.prefetched = p), this.emit({ prefetchReady: true })),
    onWarm: (warm) => this.emit({ warm }),
  });

  constructor(adventure: Adventure, app: AppSettings, services: SessionServices) {
    this.adv = adventure;
    this.log = new ActionLog(adventure.actions);
    this.app = app;
    this.svc = services;
    this.snapshot = this.build(OPENED);
    this.scripts = new SessionScripts(services, adventure, (notice) => this.emit({ notice }));
    // Until these resolve, turns rank memories by recency only and the context length is not clamped to n_ctx.
    this.resolveEmbedder().catch((e: unknown) => console.warn('no embedder; memories rank by recency', e));
    void this.deps()
      .provider.health()
      .then((h) => (this.contextSize = h.contextSize));
  }

  /** The adventure is on screen: background work that needs no turn. */
  readonly open = (): void => this.memory.open(this.idleWork.hold());

  // ---- store ---------------------------------------------------------------
  readonly subscribe = (fn: () => void): (() => void) => (this.listeners.add(fn), () => this.listeners.delete(fn));
  readonly getSnapshot = (): GameSnapshot => this.snapshot;

  private build(rest: Omit<GameSnapshot, 'adventure' | 'actions' | 'canUndo' | 'canRedo'>): GameSnapshot {
    this.adv.actions = this.log.actions;
    return { ...rest, adventure: { ...this.adv }, actions: this.log.actions, canUndo: this.log.canUndo, canRedo: this.log.canRedo };
  }
  emit(patch: Partial<GameSnapshot> = {}): void {
    this.snapshot = this.build({ ...this.snapshot, ...patch });
    for (const fn of this.listeners) fn();
  }

  readonly setApp = (app: AppSettings): void => void (this.app = app);

  private deps(): TurnDeps {
    const { svc, scripts, embedder, contextSize } = this;
    const provider = svc.providerFor(this.app, this.adv.settings.providerId);
    return { provider, tokenizer: svc.tokenizerFor(provider), scripts, embedder, contextSize, ttftTimeoutMs: svc.ttftTimeoutMs };
  }

  private async resolveEmbedder(): Promise<Embedder> {
    this.embedder = await this.svc.embedderFor(this.svc.providerFor(this.app, this.adv.settings.providerId));
    return this.embedder;
  }

  // ---- persistence ------------------------------------------------------------
  private readonly save = (): void => this.saves.schedule();
  /** The log or the adventure changed outside a turn: publish and persist. */
  readonly changed = (): void => (this.emit(), this.save());
  /** Write now; used on close and by the tests. */
  readonly flush = (): Promise<void> => this.saves.flush();
  /** The page is hiding: see `SaveQueue.persistNow`. */
  readonly persistNow = (): void => this.saves.persistNow();
  /** Stop background work and save; call when the adventure closes. */
  async close(): Promise<void> {
    this.abort?.abort();
    this.idleWork.stop();
    this.scripts.dispose();
    await this.flush();
  }

  // ---- turns ------------------------------------------------------------------
  private async drive(gen: AsyncGenerator<TurnEvent>, retrying = false): Promise<void> {
    this.emit({ busy: true, retrying, error: null, streaming: '' });
    const before = this.log.actions;
    let ok = false;
    try {
      for await (const evt of gen) ok = this.onEvent(evt) || ok;
    } finally {
      this.pending = '';
      // A retry replaced the last action's text.
      if (ok) followLog(this.adv, before, this.log.actions);
      this.emit({ busy: false, retrying: false, streaming: '' });
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
        this.lastPrepared = { result: evt.result, prompt: evt.prompt, stop: evt.stop, scriptCache: evt.scriptCache, cue: evt.cue };
        this.emit({ context: { result: evt.result, prompt: evt.prompt, scriptCache: evt.scriptCache } });
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
      case 'regenerate':
        this.pending = '';
        this.emit({ streaming: '', gated: { actionId: evt.actionId, reason: evt.reason } });
        break;
      case 'trace':
        this.storeTrace(evt.trace);
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
    const signal = this.idleWork.start(this.lastPrepared);
    this.svc.idle(() => this.memory.start(signal));
  }

  /** Diagnostics never block play; the next turn writes its own. */
  private readonly storeTrace = (t: TurnTrace): void => void this.svc.storage.putTrace(t).catch((e: unknown) => console.warn('could not store turn trace', e));

  readonly helperModel: (read: ReadKind) => Promise<HelperModel> = helperModels(this);

  /** Any player action cancels background work. */
  private beginAction(): void {
    this.idleWork.stop();
    this.emit({ warm: 'idle', error: null, contradiction: null, gated: null });
  }
  private dropPrefetch(): void {
    this.prefetched = null;
    if (this.snapshot.prefetchReady) this.emit({ prefetchReady: false });
  }

  /** `cue`: a Continue that opens with a beat (`beat.ts`). */
  readonly submit = (type: PlayerTurnType | 'continue', text: string, cue?: string): void => {
    if (this.snapshot.busy) return;
    this.beginAction();
    this.dropPrefetch();
    this.abort = new AbortController();
    void this.drive(runTurn(this.adv, this.log, { type, text, cue }, this.deps(), this.abort.signal));
  };

  /** `note`: retry with the fact the flagged output broke; `reroll`: roll the dice of the last Do again. The prefetched alternative has neither. */
  readonly retry = (note?: string, reroll = false): void => {
    if (this.snapshot.busy) return;
    this.beginAction();
    const last = this.log.last;
    const pre = this.prefetched;
    this.dropPrefetch();
    if (pre && last && pre.actionId === last.id && note === undefined && !reroll) {
      // Instant retry: the alternative was generated in the background.
      const before = this.log.actions;
      this.log.addVersion(last.id, pre.text);
      if (pre.stats) this.log.patch(last.id, { stats: pre.stats });
      followLog(this.adv, before, this.log.actions);
      this.storeTrace(pre.trace);
      this.emit();
      this.save();
      this.afterTurn();
      return;
    }
    this.abort = new AbortController();
    void this.drive(retryLast(this.adv, this.log, this.deps(), this.abort.signal, { note, reroll }), true);
  };

  readonly onError = (error: string): void => this.emit({ error });

  /** Image jobs in flight. Only this session knows them, so a reload drops them and the block becomes retryable. */
  private readonly runningImages = new Set<string>();
  readonly imagePending = (actionId: string, running: boolean): void => {
    this.runningImages[running ? 'add' : 'delete'](actionId);
    this.emit({ pendingImages: [...this.runningImages] });
  };

  /** See mode is its own chunk, off the start-up bundle. */
  private readonly seeMode = (run: (m: typeof SeeMode) => void): void => void import('./images').then(run, (e: unknown) => this.onError(String(e)));
  /** See mode: one image from the player's prompt (blank = written by the helper model), generated in the background. */
  readonly see = (brief: string): void => this.seeMode((m) => m.seeImage(brief, this));
  /** Retry (no `brief`) or rewrite the brief of a `see` action (`/raw …` sends a prompt as written); the old render stays a candidate until `chooseSee` keeps one and deletes the rest. */
  readonly regenerateSee = (id: string, brief?: string, omit?: ReadonlySet<Block>): void => this.seeMode((m) => m.regenerateImage(this, id, brief, omit));
  /** A See's prompt by block, for its details; re-composed, not stored. */
  readonly seeBlocks = async (id: string) => (await import('./images')).seeBlocks(this, id);
  readonly chooseSee = (id: string, imageId: string): void => this.seeMode((m) => m.chooseSeeCandidate(this, id, imageId));

  readonly cancel = (): void => this.abort?.abort();
  /** The turn input is focused and holds text; memory jobs wait so they do not slow the coming turn. */
  readonly setTyping = (typing: boolean): void => this.memory.setTyping(typing);

  // ---- edits --------------------------------------------------------------------
  /** A player edit: skipped while a turn runs, then published, saved and the cache re-warmed. Public for the lazy edit modules (`entityEdits`). */
  mutate(fn: (log: ActionLog, adv: Adventure) => void): void {
    if (this.snapshot.busy) return;
    const before = this.log.actions;
    const owned = ownedBlobIds({ ...this.adv, actions: before });
    fn(this.log, this.adv);
    followLog(this.adv, before, this.log.actions);
    for (const [i, a] of this.log.actions.entries()) if (i < before.length && a !== before[i]) this.memory.edited(i);
    this.seeMode((m) => m.dropOrphanImages(this, owned));
    // Editing the log makes a prefetched alternative stale unless it still targets the last action.
    if (this.prefetched && this.prefetched.actionId !== this.log.last?.id) this.dropPrefetch();
    this.idleWork.afterEdit();
    // Actions are immutable: a retry version, edit or erase replaces the last one.
    this.emit({ warm: 'idle', ...(this.log.last !== before.at(-1) && { contradiction: null }) });
    this.save();
  }

  readonly erase = () => this.mutate((log) => log.erase());
  readonly eraseTo = (id: string) => this.mutate((log) => log.eraseTo(id));
  readonly undo = () => this.mutate((log) => log.undo());
  readonly redo = () => this.mutate((log) => log.redo());
  readonly edit = (id: string, text: string) => this.mutate((log) => log.edit(id, text));
  readonly setVersion = (id: string, i: number) => this.mutate((log) => log.setActiveVersion(id, i));
  // A hand edit of who is present is logged like a turn read's, so witnessed-by sees who the player sent away.
  readonly updatePlot = (patch: Partial<PlotComponents>) =>
    this.mutate((_, adv) => {
      const plot = { ...adv.plot, ...patch };
      const presence = patch.scene && withPresence(plot, patch.scene, adv.actions.length - 1);
      adv.plot = presence ? { ...plot, presence } : plot;
    });
  readonly updateSettings = (patch: Partial<AdventureSettings>) => this.mutate((_, adv) => (adv.settings = { ...adv.settings, ...patch }));
  readonly updateMeta = (patch: Partial<Pick<Adventure, 'title' | 'description' | 'tags' | 'coverId'>>) => this.mutate((_, adv) => Object.assign(adv, patch));
  /** A card written for a known entity links it now (`linkCards`), not at the next fold. */
  readonly setStoryCards = (c: Adventure['storyCards']) => this.mutate((_, adv) => ((adv.storyCards = c), (adv.entities = linkCards(adv.entities, c))));
  readonly setScripts = (scripts: Adventure['scripts']) => this.mutate((_, adv) => ((adv.scripts = scripts), this.scripts.reload(adv)));
  readonly setCardGenerator = (s: NonNullable<Adventure['cardGenerator']>) => this.mutate((_, adv) => (adv.cardGenerator = s));
  readonly clearError = () => this.emit({ error: null });
  readonly clearNotice = () => this.emit({ notice: null });

  /** Build (without sending) the context for the current log, so the viewer works before the first turn. */
  readonly previewContext = async (): Promise<void> => {
    const prepared = await prepareContext(this.adv, this.log.actions, this.deps());
    if ('stopped' in prepared) return this.emit({ notice: prepared.stopped });
    this.lastPrompt = prepared.prompt;
    this.emit({ context: { result: prepared.result, prompt: prepared.prompt, scriptCache: prepared.scriptCache } });
  };
}
