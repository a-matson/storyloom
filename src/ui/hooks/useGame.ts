import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Adventure, AdventureSettings, AppSettings, PlotComponents } from '@core/types';
import { ActionLog } from '@core/actionLog';
import type { ContextBuildResult } from '@core/contextBuilder';
import { prepareContext, retryLast, runTurn, type PlayerTurnType } from '@core/engine';
import { runMemoryMaintenance } from '@core/memoryJobs';
import { markStale } from '@core/memoryBank';
import { embedderFor, providerFor, scripts, storage, tokenizer } from '../services';

export interface GameState {
  adventure: Adventure;
  log: ActionLog;
  version: number;
  busy: boolean;
  streaming: string;
  context: { result: ContextBuildResult; prompt: string } | null;
  error: string | null;
  notice: string | null;
}

/**
 * Owns one adventure while it is open: the action log, streaming state, the
 * last context sent, persistence (debounced) and background memory jobs.
 */
export function useGame(initial: Adventure, app: AppSettings) {
  const advRef = useRef<Adventure>(initial);
  const logRef = useRef(new ActionLog(initial.actions));
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [context, setContext] = useState<GameState['context']>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<string>('');
  const saveTimer = useRef<number | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const save = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const adv = advRef.current;
      adv.actions = logRef.current.actions;
      adv.updatedAt = Date.now();
      void storage.putAdventure(adv);
    }, 300);
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const adv = advRef.current;
    adv.actions = logRef.current.actions;
    void storage.putAdventure(adv);
  }, []);

  const deps = useMemo(() => {
    const provider = providerFor(app, advRef.current.settings.providerId);
    return { provider, tokenizer, scripts };
  }, [app, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleMaintenance = useCallback(() => {
    const run = async () => {
      const adv = advRef.current;
      const utility = app.providers.find((p) => p.role === 'utility');
      const provider = providerFor(app, utility?.id ?? adv.settings.providerId);
      const embedder = await embedderFor(provider);
      try {
        const report = await runMemoryMaintenance(adv, { provider, embedder, template: adv.settings.template });
        if (report.memoriesWritten || report.summaryUpdated) {
          bump();
          save();
        }
      } catch (e) {
        // Background work must never surface as a blocking error.
        console.warn('memory maintenance failed', e);
      }
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => void run());
    else window.setTimeout(() => void run(), 800);
  }, [app, bump, save]);

  const drive = useCallback(
    async (gen: AsyncGenerator<import('@core/engine').TurnEvent>) => {
      setBusy(true);
      setError(null);
      setStreaming('');
      const adv = advRef.current;
      let ok = false;
      try {
        for await (const evt of gen) {
          switch (evt.type) {
            case 'player':
              bump();
              break;
            case 'context':
              promptRef.current = evt.prompt;
              setContext({ result: evt.result, prompt: evt.prompt });
              break;
            case 'token':
              setStreaming((s) => s + evt.text);
              break;
            case 'done':
              ok = true;
              if (evt.stats?.promptTokens && evt.stats.promptTokens > 200 && promptRef.current) {
                // Calibrate the heuristic tokenizer against the backend's real count.
                tokenizer.calibrate(promptRef.current, evt.stats.promptTokens);
              }
              break;
            case 'message':
              setNotice(evt.text);
              break;
            case 'stopped':
              if (evt.reason !== 'cancelled') setNotice(evt.reason);
              break;
            case 'error':
              setError(evt.message);
              break;
          }
        }
      } finally {
        setStreaming('');
        setBusy(false);
        adv.actions = logRef.current.actions;
        bump();
        save();
        if (ok) scheduleMaintenance();
      }
    },
    [bump, save, scheduleMaintenance],
  );

  const submit = useCallback(
    (type: PlayerTurnType | 'continue', text: string) => {
      if (busy) return;
      abortRef.current = new AbortController();
      void drive(runTurn(advRef.current, logRef.current, { type, text }, deps, abortRef.current.signal));
    },
    [busy, deps, drive],
  );

  const retry = useCallback(() => {
    if (busy) return;
    abortRef.current = new AbortController();
    void drive(retryLast(advRef.current, logRef.current, deps, abortRef.current.signal));
  }, [busy, deps, drive]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const mutate = useCallback(
    (fn: (log: ActionLog, adv: Adventure) => void) => {
      if (busy) return;
      fn(logRef.current, advRef.current);
      advRef.current.actions = logRef.current.actions;
      bump();
      save();
    },
    [busy, bump, save],
  );

  const api = {
    submit,
    retry,
    cancel,
    erase: () => mutate((log, adv) => {
      const a = log.erase();
      if (a) adv.memories = markStale(adv.memories, new Set([a.id]));
    }),
    eraseTo: (id: string) => mutate((log, adv) => {
      const removed = log.eraseTo(id);
      adv.memories = markStale(adv.memories, new Set(removed.map((a) => a.id)));
    }),
    undo: () => mutate((log) => log.undo()),
    redo: () => mutate((log) => log.redo()),
    edit: (id: string, text: string) => mutate((log, adv) => {
      log.edit(id, text);
      adv.memories = markStale(adv.memories, new Set([id]));
    }),
    setVersion: (id: string, i: number) => mutate((log) => log.setActiveVersion(id, i)),
    updatePlot: (patch: Partial<PlotComponents>) => mutate((_, adv) => {
      adv.plot = { ...adv.plot, ...patch };
    }),
    updateSettings: (patch: Partial<AdventureSettings>) => mutate((_, adv) => {
      adv.settings = { ...adv.settings, ...patch };
    }),
    updateMeta: (patch: Partial<Pick<Adventure, 'title' | 'description' | 'tags'>>) => mutate((_, adv) => Object.assign(adv, patch)),
    setStoryCards: (cards: Adventure['storyCards']) => mutate((_, adv) => {
      adv.storyCards = cards;
    }),
    clearError: () => setError(null),
    clearNotice: () => setNotice(null),
    /**
     * Build (without sending) the context for the current log, so the viewer
     * works before any turn has been generated in this session.
     */
    previewContext: async () => {
      const adv = advRef.current;
      const prepared = await prepareContext(adv, logRef.current.actions, deps);
      if ('stopped' in prepared) {
        setNotice(prepared.stopped);
        return;
      }
      promptRef.current = prepared.prompt;
      setContext({ result: prepared.result, prompt: prepared.prompt });
    },
  };

  const state: GameState = { adventure: advRef.current, log: logRef.current, version, busy, streaming, context, error, notice };
  return [state, api] as const;
}

export type GameApi = ReturnType<typeof useGame>[1];
