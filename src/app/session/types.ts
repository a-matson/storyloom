import type { ContextBuildResult, ScriptCache } from '@core/context';
import type { Action, Adventure, AppSettings, TurnTrace } from '@core/model';
import type { CompletionStats, Embedder, ImageProvider, Provider, ScriptRunner, Storage } from '@core/ports';
import type { CalibratedTokenizer, Tokenizer } from '@core/text';

/** Immutable view of an open adventure; a new object on every change. */
export interface GameSnapshot {
  adventure: Adventure;
  actions: Action[];
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  streaming: string;
  context: { result: ContextBuildResult; prompt: string; scriptCache?: ScriptCache | undefined } | null;
  error: string | null;
  notice: string | null;
  /** A retry alternative is ready; Retry will be instant. */
  prefetchReady: boolean;
  /** `see` action ids with a live `txt2img`. Session state, not schema: after a reload nothing is running, so an image-less block is retryable instead of forever "Generating…". */
  pendingImages: readonly string[];
  /** KV-cache warm-up state for the next turn. */
  warm: 'idle' | 'warming' | 'warm';
  /** The contradiction check flagged the last output; cleared when that output changes. Not persisted. */
  contradiction: { actionId: string; fact: string } | null;
}

/** Session state of a freshly opened adventure. */
export const OPENED: Omit<GameSnapshot, 'adventure' | 'actions' | 'canUndo' | 'canRedo'> = {
  busy: false,
  streaming: '',
  context: null,
  error: null,
  notice: null,
  prefetchReady: false,
  pendingImages: [],
  warm: 'idle',
  contradiction: null,
};

export interface SessionServices {
  providerFor: (app: AppSettings, id: string) => Provider;
  /** Undefined when no image server is configured; the adapter loads on first use. */
  imageProviderFor: (app: AppSettings) => Promise<ImageProvider> | undefined;
  embedderFor: (provider: Provider) => Promise<Embedder>;
  /** Calibrated after each turn; the fallback behind `tokenizerFor`. */
  tokenizer: CalibratedTokenizer;
  tokenizerFor: (provider: Provider) => Tokenizer;
  /** Resolved once when the adventure opens; loading the sandbox is lazy. */
  scriptsFor: (adv: Adventure) => Promise<ScriptRunner>;
  storage: Storage;
  /** Run background work when the browser is idle. */
  idle: (fn: () => void) => void;
  /** Run before the next paint. */
  frame: (fn: () => void) => void;
  saveDelayMs: number;
  /** A txt2img that runs longer than this is abandoned. */
  imageTimeoutMs: number;
  /** Quiet time after the last edit before the cache is re-warmed. */
  rewarmDelayMs: number;
}

export interface Prefetched {
  actionId: string;
  text: string;
  stats?: CompletionStats | undefined;
  /** Built at prefetch time; persisted only if the alternative is used. */
  trace: TurnTrace;
}
