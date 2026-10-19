import type { GameApi } from '@ui/hooks/useGameSession';
import { COMMANDS, MODE_IDS, MODES, type Draft } from './modes';

export interface PaletteEntry {
  id: string;
  label: string;
  keys?: string;
  group: 'Command' | 'Action' | 'Section';
  run: () => void;
}

export interface PaletteContext {
  api: Pick<GameApi, 'retry' | 'submit' | 'erase' | 'undo' | 'redo'>;
  draft: (d: Draft) => void;
  markSecret: () => void;
  openContext: () => void;
  toggleSidebar: () => void;
  /** A sidebar tab, then a sub-tab of it. */
  openSection: (tab: string, sub?: string) => void;
}

const SECTIONS = ['Plot', 'Story cards', 'Characters', 'World', 'Rules', 'Details'];

/** Everything the palette offers. Slash commands are inserted, not run: they take text. */
export function paletteEntries(ctx: PaletteContext): PaletteEntry[] {
  const { api } = ctx;
  return [
    ...COMMANDS.map((c): PaletteEntry => ({ id: c, label: `/${c}`, group: 'Command', run: () => ctx.draft({ text: `/${c} ` }) })),
    ...MODE_IDS.map((m): PaletteEntry => ({ id: m, label: `${MODES[m].label} mode`, keys: `/${m}`, group: 'Command', run: () => ctx.draft({ mode: m }) })),
    { id: 'continue', label: 'Continue', keys: 'Ctrl+Enter', group: 'Action', run: () => api.submit('continue', '') },
    { id: 'retry', label: 'Retry', keys: 'Ctrl+R', group: 'Action', run: () => api.retry() },
    { id: 'erase', label: 'Erase', group: 'Action', run: api.erase },
    { id: 'undo', label: 'Undo', keys: 'Ctrl+Z', group: 'Action', run: api.undo },
    { id: 'redo', label: 'Redo', keys: 'Ctrl+Shift+Z', group: 'Action', run: api.redo },
    { id: 'secret', label: 'Mark secret (last Do/Say)', group: 'Action', run: ctx.markSecret },
    { id: 'context', label: 'View context', group: 'Action', run: ctx.openContext },
    { id: 'sidebar', label: 'Toggle sidebar', keys: 'Ctrl+.', group: 'Action', run: ctx.toggleSidebar },
    ...SECTIONS.map((s): PaletteEntry => ({ id: `section-${s}`, label: s, group: 'Section', run: () => ctx.openSection('Adventure', s) })),
    { id: 'section-Gameplay', label: 'Gameplay', group: 'Section', run: () => ctx.openSection('Gameplay') },
  ];
}

const bare = (s: string) => s.toLowerCase().replace(/^\//, '');

/** Case-insensitive subsequence match on the label; prefix matches first, otherwise the given order. */
export function filterEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const q = bare(query.trim());
  const matches = (label: string) => {
    let i = 0;
    for (const ch of label) if (ch === q[i]) i++;
    return i === q.length;
  };
  const rank = (e: PaletteEntry) => (bare(e.label).startsWith(q) ? 0 : 1);
  return entries.filter((e) => matches(bare(e.label))).toSorted((a, b) => rank(a) - rank(b));
}
