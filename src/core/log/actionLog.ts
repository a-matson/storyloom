import type { Action, ActionType } from '../model/types';
import { actionText, newId } from '../model/types';

/**
 * Event-sourced action log with retry alternatives, edits, erase / erase-to-here
 * and session-scoped undo/redo.
 *
 * Actions are immutable values; every operation produces a new `actions`
 * array that shares unchanged Action objects with the previous one, and the
 * previous array is kept on the undo stack. This makes undo/redo O(1) and
 * means nothing is destroyed until the adventure is saved without it.
 */
export interface LogState {
  actions: Action[];
}

export class ActionLog {
  private undoStack: Action[][] = [];
  private redoStack: Action[][] = [];
  private _actions: Action[];

  constructor(actions: Action[] = []) {
    this._actions = actions;
  }

  get actions(): Action[] {
    return this._actions;
  }

  get length(): number {
    return this._actions.length;
  }

  get last(): Action | undefined {
    return this._actions[this._actions.length - 1];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Replace the whole log without touching undo history (e.g. after load). */
  reset(actions: Action[]): void {
    this._actions = actions;
    this.undoStack = [];
    this.redoStack = [];
  }

  private commit(next: Action[]): void {
    this.undoStack.push(this._actions);
    this.redoStack = [];
    this._actions = next;
  }

  append(type: ActionType, text: string, extra: Partial<Action> = {}): Action {
    const action: Action = {
      id: newId('act_'),
      type,
      versions: [text],
      active: 0,
      createdAt: Date.now(),
      ...extra,
    };
    this.commit([...this._actions, action]);
    return action;
  }

  /** Add a retry alternative to the action with `id` (usually the last AI output) and make it active. */
  addVersion(id: string, text: string): Action | undefined {
    const found = this.locate(id);
    if (!found) return undefined;
    const { idx, action: a } = found;
    const updated: Action = { ...a, versions: [...a.versions, text], active: a.versions.length };
    this.commit(this.replaceAt(idx, updated));
    return updated;
  }

  /** Switch which retry alternative is shown. */
  setActiveVersion(id: string, index: number): Action | undefined {
    const found = this.locate(id);
    if (!found) return undefined;
    const { idx, action: a } = found;
    if (index < 0 || index >= a.versions.length || index === a.active) return a;
    const updated: Action = { ...a, active: index };
    this.commit(this.replaceAt(idx, updated));
    return updated;
  }

  /** Edit an action's text in place (kept as a new version so it can be undone). */
  edit(id: string, text: string): Action | undefined {
    if (text === undefined) return undefined;
    const a = this.locate(id)?.action;
    if (!a) return undefined;
    if (actionText(a) === text) return a;
    return this.addVersion(id, text);
  }

  /** Remove the most recent action. */
  erase(): Action | undefined {
    if (this._actions.length === 0) return undefined;
    const last = this.last;
    this.commit(this._actions.slice(0, -1));
    return last;
  }

  /** Remove the action with `id` and everything after it. */
  eraseTo(id: string): Action[] {
    const idx = this.indexOf(id);
    if (idx < 0) return [];
    const removed = this._actions.slice(idx);
    this.commit(this._actions.slice(0, idx));
    return removed;
  }

  /** Attach generation stats / image to an action without a new version. */
  patch(id: string, patch: Partial<Pick<Action, 'stats' | 'image'>>): void {
    const found = this.locate(id);
    if (!found) return;
    this.commit(this.replaceAt(found.idx, { ...found.action, ...patch }));
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this._actions);
    this._actions = prev;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this._actions);
    this._actions = next;
    return true;
  }

  indexOf(id: string): number {
    return this._actions.findIndex((a) => a.id === id);
  }

  private locate(id: string): { idx: number; action: Action } | undefined {
    const idx = this.indexOf(id);
    const action = this._actions[idx];
    return action ? { idx, action } : undefined;
  }

  private replaceAt(idx: number, a: Action): Action[] {
    const next = this._actions.slice();
    next[idx] = a;
    return next;
  }
}
