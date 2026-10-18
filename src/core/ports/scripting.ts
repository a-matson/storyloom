import type { Action, Entity, ScriptState, StoryCard } from '../model/types';

export type { ScriptState } from '../model/types';
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
  /** AID's player-facing card name; core calls it `name`. */
  title: string;
  /** AID's player-only notes field; core calls it `notes`. */
  description: string;
}

/** Read-only and flattened (facts as plain text, no ids or sources) so a script cannot mistake it for a writable record. */
export interface ScriptEntity {
  id: string;
  kind: Entity['kind'];
  name: string;
  aliases: string[];
  description: string;
  facts: string[];
  state: Record<string, string>;
}

/** `state.scene`: the scene with names, not ids. */
export interface ScriptScene {
  location?: string | undefined;
  zone?: string | undefined;
  present: string[];
  groups: { name: string; count?: number | undefined }[];
  time?: { day: number; part: string } | undefined;
}

/** `state.events`: the latest event assertions, `who` as names (`you` stays `you`). */
export interface ScriptEvent {
  at: number;
  text: string;
  who: string[];
}

export interface ScriptInfo {
  characterNames: string[];
  actionCount: number;
  /** onInput only; `continue` on a Continue, whose text is empty and whose returned text is ignored. */
  actionType?: Action['type'] | 'continue' | undefined;
  /** onModelContext: 0 on a turn and a plain retry; on a Re-roll, how many versions the output already has. */
  retry?: number | undefined;
  /** The adventure's consequences setting, for the dice script. */
  consequences?: 'harsh' | 'fair' | 'none' | undefined;
  /** onModelContext only */
  maxChars?: number;
  memoryLength?: number;
}

/**
 * A section as a script sees and returns it. `kind` is whatever the script put there:
 * `applyScriptSections` validates it, recounts the tokens and decides cacheability.
 */
export interface ScriptSection {
  kind: string;
  text: string;
  /** Read-only: whether the section is part of the cached prefix. Ignored on the way back. */
  cacheable?: boolean | undefined;
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
  /** `state.entities` in onModelContext and onOutput; never written back. */
  entities?: ScriptEntity[] | undefined;
  /** `state.scene` and `state.events`, the same way (a Storyloom extension). */
  scene?: ScriptScene | undefined;
  events?: ScriptEvent[] | undefined;
}

export interface HookResult {
  text?: string | undefined;
  stop?: boolean | undefined;
  state: ScriptState;
  storyCards: ScriptStoryCard[];
  /** Only set when the hook was given `sections`; absent means "unchanged". */
  sections?: ScriptSection[] | undefined;
  logs: string[];
  error?: string | undefined;
  /** Wall time in ms. */
  elapsedMs: number;
}

export interface ScriptRunner {
  /** Compile scripts once per scenario; returns false with an error on syntax problems. */
  load(scripts: { library: string; input: string; context: string; output: string }): Promise<{ ok: boolean; error?: string | undefined }>;
  run(input: HookInput): Promise<HookResult>;
  dispose(): void;
}

/** Converts core StoryCards to the script-facing shape (`keys` is the raw comma-separated string). */
export function toScriptCards(cards: StoryCard[]): ScriptStoryCard[] {
  return cards.map((c) => ({ id: c.id, keys: c.triggers.join(','), entry: c.entry, type: c.type, title: c.name, description: c.notes ?? '' }));
}

/** The script-facing shape of the built sections; `tokens`/`trimmed` stay host-side. */
export function plainSections(sections: ContextSection[] | undefined): ScriptSection[] | undefined {
  return sections?.map((s) => ({ kind: s.kind, text: s.text, cacheable: s.cacheable }));
}

/** Pass-through runner used until the QuickJS sandbox lands. */
export class NoopScriptRunner implements ScriptRunner {
  async load(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
  async run(input: HookInput): Promise<HookResult> {
    return { text: input.text, state: input.state, storyCards: input.storyCards, sections: plainSections(input.sections), logs: [], elapsedMs: 0 };
  }
  dispose(): void {}
}
