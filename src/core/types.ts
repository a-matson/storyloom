/**
 * Core data model. Everything here is plain JSON-serialisable data so it can
 * live in IndexedDB/SQLite, be exported as a zip, and be passed to workers.
 *
 * Naming follows the AI Dungeon vocabulary
 * so community knowledge and scripts transfer: Adventure, Scenario,
 * Story Card, Plot Essentials, Author's Note, Memory Bank, Story Summary.
 */

export type ActionType = 'start' | 'continue' | 'do' | 'say' | 'story' | 'see';

/** Statistics captured from the provider for a generated action. */
export interface GenerationStats {
  model?: string;
  promptTokens?: number;
  cachedTokens?: number;
  generatedTokens?: number;
  promptMs?: number;
  generationMs?: number;
}

/**
 * One entry in the adventure's action log.
 *
 * `versions` holds every text this action has had: for AI outputs these are
 * the retry alternatives ("retry stack"), for any action an Edit pushes a new
 * version. `active` points at the version currently shown and sent to the AI.
 * Actions are treated as immutable values: mutating operations return a new
 * object (see actionLog.ts), which is what makes undo/redo cheap.
 */
export interface Action {
  id: string;
  type: ActionType;
  versions: string[];
  active: number;
  createdAt: number;
  /** Present for `see` actions (image generation). */
  image?: { url: string; prompt: string; model?: string };
  stats?: GenerationStats;
}

export function actionText(a: Action): string {
  return a.versions[a.active] ?? a.versions[a.versions.length - 1] ?? '';
}

/** Always-on prompt pieces ("Plot Components"). All optional. */
export interface PlotComponents {
  /** Sent as the system prompt. */
  aiInstructions?: string;
  /** Maintained by auto-summarisation, hand-editable. */
  storySummary?: string;
  /** Formerly "Memory": key facts always in context. */
  plotEssentials?: string;
  /** Short style/tone guidance injected near the end of the prompt. */
  authorsNote?: string;
  /** Replace "You" in Do/Say actions with a character name. */
  thirdPerson?: { enabled: boolean; name: string };
}

export interface StoryCard {
  id: string;
  /** Character | Class | Race | Location | Faction | custom string. Not seen by the AI. */
  type: string;
  /** For the player only; the AI never sees it. */
  name: string;
  /** What the AI sees, prefixed by "World Lore:" in context. */
  entry: string;
  /** Case-insensitive substrings; sensitive to leading/trailing spaces. */
  triggers: string[];
  /** Never sent to the AI (except as an option description in Character Creator). */
  notes?: string;
  /** Character Creator: whether players can pick this card. */
  selectable?: boolean;
}

/** An AI-written summary of a run of six actions, embedded for retrieval. */
export interface Memory {
  id: string;
  text: string;
  /** Inclusive start / exclusive end index into the action log at creation time. */
  fromAction: number;
  toAction: number;
  /** Action ids covered, so edits can mark the memory stale. */
  actionIds: string[];
  embedding?: number[];
  useCount: number;
  createdAt: number;
  lastUsedAt?: number;
  stale?: boolean;
}

export type TemplateId = 'chatml' | 'llama3' | 'mistral' | 'gemma' | 'raw';

export interface ModelSettings {
  /** Input budget in tokens (what the context builder may fill). */
  contextLength: number;
  /** Max tokens to generate per turn. */
  responseLength: number;
  temperature: number;
  topK: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
  minP?: number;
  repetitionPenalty?: number;
  seed?: number;
}

export interface MemorySettings {
  autoSummary: boolean;
  memoryBank: boolean;
  /** Max memories kept per adventure (AID tiers: 25/100/200/400/800). */
  bankSize: number;
}

export interface ContextSettings {
  /**
   * Reorder the prompt so history comes before triggered cards/memories,
   * keeping a byte-stable, append-only prefix for the backend's KV cache.
   * Off = AI Dungeon's documented ordering.
   */
  cacheStableLayout: boolean;
  /** When trimming history, drop the oldest actions in blocks of this size. */
  evictionChunk: number;
  /** Include the raw model output (no sentence trimming). */
  rawOutput: boolean;
  /** Show a warning on the context meter when cards or plot components did not fit. */
  contextWarning?: boolean;
  /** After each turn, prefill the next turn's stable prefix so the backend's KV cache is warm. */
  cacheWarming?: boolean;
  /** After each turn, generate one retry alternative in the background on a second slot. */
  retryPrefetch?: boolean;
}

export interface AdventureSettings {
  providerId: string;
  /** Model id as reported by the provider (e.g. GGUF file name). */
  modelId?: string;
  template: TemplateId;
  model: ModelSettings;
  memory: MemorySettings;
  context: ContextSettings;
  /** Cosmetic: 'print' | 'clean' | 'hacker'. */
  textStyle: 'print' | 'clean' | 'hacker';
}

export interface Adventure {
  id: string;
  title: string;
  description: string;
  tags: string[];
  coverUrl?: string;
  scenarioId?: string;
  /** Active path of the story, in order. */
  actions: Action[];
  plot: PlotComponents;
  storyCards: StoryCard[];
  memories: Memory[];
  /** Persistent object scripts may read/write (`state` in the scripting API). */
  scriptState: Record<string, unknown>;
  /** Answers given to ${placeholders} when the adventure was created. */
  placeholders: { question: string; answer: string }[];
  settings: AdventureSettings;
  /** Story-card generator settings (AI instructions, story information…). Per adventure, like AI Dungeon. */
  cardGenerator?: {
    speedCreate: boolean;
    includeSummary: boolean;
    logToNotes: boolean;
    aiInstructions: string;
    storyInformation: string;
  };
  createdAt: number;
  updatedAt: number;
}

export type ScenarioType = 'story' | 'characterCreator' | 'multipleChoice';

export interface ScenarioScripts {
  library: string;
  input: string;
  context: string;
  output: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  tags: string[];
  coverUrl?: string;
  type: ScenarioType;
  /** The first action of a new adventure. May contain ${placeholders}. */
  prompt: string;
  plot: PlotComponents;
  storyCards: StoryCard[];
  scripts?: ScenarioScripts;
  /** Multiple choice: child scenarios, each a full scenario. */
  options?: Scenario[];
  parentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  providers: ProviderConfig[];
  defaultProviderId: string;
  defaults: AdventureSettings;
  theme: 'dark' | 'light' | 'sepia';
  highContrast: boolean;
  textAnimation: boolean;
  textSize: 'default' | 'large' | 'larger';
  stickyInput: boolean;
  compactButtons: boolean;
}

export interface ProviderConfig {
  id: string;
  kind: 'demo' | 'llama-server' | 'openai-compat' | 'koboldcpp' | 'ollama';
  name: string;
  baseUrl: string;
  /** Optional: a second, small model server for summaries/cards/image prompts. */
  role?: 'story' | 'utility';
}

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  contextLength: 8192,
  responseLength: 150,
  temperature: 1.0,
  topK: 250,
  topP: 0.95,
  presencePenalty: 0.25,
  frequencyPenalty: 0,
};

export const DEFAULT_ADVENTURE_SETTINGS: AdventureSettings = {
  providerId: 'local',
  template: 'chatml',
  model: DEFAULT_MODEL_SETTINGS,
  memory: { autoSummary: true, memoryBank: true, bankSize: 200 },
  context: {
    cacheStableLayout: true,
    evictionChunk: 8,
    rawOutput: false,
    contextWarning: true,
    cacheWarming: true,
    retryPrefetch: false,
  },
  textStyle: 'print',
};

let counter = 0;
/** Small unique id; prefer crypto.randomUUID when available. */
export function newId(prefix = ''): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID();
  counter += 1;
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
