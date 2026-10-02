import type { Action, StoryCard } from '../model/types';
import type { ContextSection } from '../context/types';

/**
 * Scripting API (AI Dungeon compatible).
 *
 * Three hooks, each a JavaScript "modifier" ending in `modifier(text)`:
 *   onInput        — rewrite the player's input text
 *   onModelContext — rewrite the text sent to the model
 *   onOutput       — rewrite the model's output
 *
 * Scripts run in an isolated sandbox (QuickJS in a Web Worker) with a 16 MB
 * memory limit and a 2 s timeout. This file only defines the contract; the
 * runner lives in ./quickjsRunner.ts (milestone 6) and a no-op runner is
 * used until then.
 */

export type HookName = 'onInput' | 'onModelContext' | 'onOutput';

export interface ScriptHistoryEntry {
  text: string;
  /** Deprecated alias kept for backwards compatibility with community scripts. */
  rawText: string;
  type: Action['type'];
}

export interface ScriptStoryCard {
  id: string;
  keys: string;
  entry: string;
  type: string;
}

export interface ScriptMemory {
  context?: string;
  authorsNote?: string | undefined;
  frontMemory?: string;
}

export interface ScriptState {
  memory?: ScriptMemory;
  message?: string;
  placeholders?: { question: string; answer: string }[];
  [key: string]: unknown;
}

export interface ScriptInfo {
  characterNames: string[];
  actionCount: number;
  /** onModelContext only */
  maxChars?: number;
  memoryLength?: number;
}

export interface HookInput {
  hook: HookName;
  text: string;
  history: ScriptHistoryEntry[];
  storyCards: ScriptStoryCard[];
  state: ScriptState;
  info: ScriptInfo;
  /**
   * Cache-safe mode: the context as sections. A script that only touches
   * `sections` keeps the prefix cache; a script that returns `text` replaces
   * the whole prompt (cache miss every turn).
   */
  sections?: ContextSection[] | undefined;
}

export interface HookResult {
  text?: string;
  stop?: boolean;
  state: ScriptState;
  storyCards: ScriptStoryCard[];
  sections?: ContextSection[] | undefined;
  logs: string[];
  error?: string;
  /** Wall time in ms. */
  elapsedMs: number;
}

export interface ScriptRunner {
  /** Compile scripts once per scenario; returns false with an error on syntax problems. */
  load(scripts: { library: string; input: string; context: string; output: string }): Promise<{ ok: boolean; error?: string }>;
  run(input: HookInput): Promise<HookResult>;
  dispose(): void;
}

/** Converts core StoryCards to the script-facing shape (`keys` is the raw comma-separated string). */
export function toScriptCards(cards: StoryCard[]): ScriptStoryCard[] {
  return cards.map((c) => ({ id: c.id, keys: c.triggers.join(','), entry: c.entry, type: c.type }));
}

/** Pass-through runner used until the QuickJS sandbox lands. */
export class NoopScriptRunner implements ScriptRunner {
  async load(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
  async run(input: HookInput): Promise<HookResult> {
    return { text: input.text, state: input.state, storyCards: input.storyCards, sections: input.sections, logs: [], elapsedMs: 0 };
  }
  dispose(): void {}
}
