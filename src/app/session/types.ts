import type { ContextBuildResult } from '@core/context';
import type { Action, Adventure, AppSettings } from '@core/model';
import type { CompletionStats, Embedder, Provider, ScriptRunner, Storage } from '@core/ports';
import type { CalibratedTokenizer } from '@core/text';

/** Immutable view of an open adventure; a new object on every change. */
export interface GameSnapshot {
  adventure: Adventure;
  actions: Action[];
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  streaming: string;
  context: { result: ContextBuildResult; prompt: string } | null;
  error: string | null;
  notice: string | null;
  /** A retry alternative is ready; Retry will be instant. */
  prefetchReady: boolean;
  /** KV-cache warm-up state for the next turn. */
  warm: 'idle' | 'warming' | 'warm';
}

export interface SessionServices {
  providerFor: (app: AppSettings, id: string) => Provider;
  embedderFor: (provider: Provider) => Promise<Embedder>;
  tokenizer: CalibratedTokenizer;
  scripts: ScriptRunner;
  storage: Storage;
  /** Run background work when the browser is idle. */
  idle: (fn: () => void) => void;
  saveDelayMs: number;
}

export interface Prefetched {
  actionId: string;
  text: string;
  stats?: CompletionStats | undefined;
}
