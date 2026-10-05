import type { PlayerTurnType } from '@core/turn';

export type Mode = PlayerTurnType | 'see';

interface ModeStyle {
  label: string;
  prefix: string;
  hint: string;
  /** Chip when selected; input border, prefix and send button. */
  chip: string;
  /** Border *and* ring of the turn input while it has focus. */
  focus: string;
  text: string;
  bg: string;
}

export const MODES: Record<Mode, ModeStyle> = {
  do: {
    label: 'Do',
    prefix: '›',
    hint: 'What do you do?',
    chip: 'aria-pressed:border-mode-do aria-pressed:bg-mode-do',
    focus: 'focus-within:border-mode-do focus-within:ring-1 focus-within:ring-mode-do',
    text: 'text-mode-do',
    bg: 'bg-mode-do',
  },
  say: {
    label: 'Say',
    prefix: '“',
    hint: 'What do you say?',
    chip: 'aria-pressed:border-mode-say aria-pressed:bg-mode-say',
    focus: 'focus-within:border-mode-say focus-within:ring-1 focus-within:ring-mode-say',
    text: 'text-mode-say',
    bg: 'bg-mode-say',
  },
  story: {
    label: 'Story',
    prefix: '¶',
    hint: 'Narrate what happens next',
    chip: 'aria-pressed:border-mode-story aria-pressed:bg-mode-story',
    focus: 'focus-within:border-mode-story focus-within:ring-1 focus-within:ring-mode-story',
    text: 'text-mode-story',
    bg: 'bg-mode-story',
  },
  see: {
    label: 'See',
    prefix: '◉',
    hint: 'Describe an image, or leave blank to auto-prompt (needs an image backend)',
    chip: 'aria-pressed:border-mode-see aria-pressed:bg-mode-see',
    focus: 'focus-within:border-mode-see focus-within:ring-1 focus-within:ring-mode-see',
    text: 'text-mode-see',
    bg: 'bg-mode-see',
  },
};

export const MODE_IDS: Mode[] = ['do', 'say', 'story', 'see'];

/** `/say hello` → ['say', 'hello']; anything else → null. */
export function parseSlash(raw: string): [Mode, string] | null {
  const m = /^\/(do|say|story|see)\s*(.*)$/s.exec(raw);
  const mode = MODE_IDS.find((id) => id === m?.[1]);
  return mode === undefined ? null : [mode, m?.[2] ?? ''];
}
