/* eslint-disable jsx-a11y/prefer-tag-over-role -- an ARIA combobox: a select or datalist cannot filter as you type or show keycaps */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input } from '@ui/components/ui/field';
import { cn } from '@ui/lib/utils';
import { filterEntries, paletteEntries, type PaletteContext, type PaletteEntry } from './palette';

export interface PaletteProps {
  api: GameApi;
  draft: PaletteContext['draft'];
  onViewContext: () => void;
  onClose: () => void;
}

const click = (el: HTMLElement | undefined | null) => flushSync(() => el?.click());
const sidebarToggle = () => document.querySelector<HTMLButtonElement>('header button[aria-label="Adventure settings"]');

/** The sidebar keeps its open and tab state to itself, so a section opens the way a player would: by clicking. */
function openSection(tab: string, sub?: string) {
  if (sidebarToggle()?.getAttribute('aria-expanded') !== 'true') click(sidebarToggle());
  const aside = document.querySelector('aside[aria-label="Adventure settings"]');
  const button = (selector: string, label: string) =>
    [...(aside?.querySelectorAll<HTMLButtonElement>(selector) ?? [])].find((b) => b.textContent.startsWith(label));
  click(button('[role=tab]', tab));
  const target = sub === undefined ? button('[role=tab]', tab) : button('[aria-pressed]', sub);
  click(target);
  target?.scrollIntoView({ block: 'nearest' });
  target?.focus();
}

function context({ api, draft, onViewContext }: PaletteProps): PaletteContext {
  return {
    api,
    draft: (d) => {
      draft(d);
      document.getElementById('turn-input')?.focus();
    },
    // The pill on the last Do/Say opens its own form, as a click on it would.
    markSecret: () => click([...document.querySelectorAll<HTMLButtonElement>('main button[aria-label="Mark secret"]')].at(-1)),
    openContext: onViewContext,
    toggleSidebar: () => click(sidebarToggle()),
    openSection,
  };
}

/** Ctrl/⌘+K: every command, action and sidebar section, searchable. A native modal dialog: Escape and the focus trap are the browser's. */
export function CommandPalette(props: PaletteProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => ref.current?.showModal(), []);
  const entries = filterEntries(paletteEntries(context(props)), query);
  const current = Math.min(active, entries.length - 1);

  const run = (e: PaletteEntry | undefined) => {
    if (!e) return;
    // Closed first: a modal dialog leaves the rest of the page inert, so nothing outside it could take focus.
    ref.current?.close();
    e.run();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      if (entries.length > 0) setActive((current + step + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(entries[current]);
    } else if (e.key === 'Escape') {
      // The dialog closes itself; the game's Escape (close the sidebar sheet) must not see it too.
      e.stopPropagation();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onClose={props.onClose}
      className="w-full max-w-story rounded-lg border border-border bg-card p-0 text-foreground backdrop:bg-[rgba(0,0,0,0.35)]"
    >
      <Input
        role="combobox"
        aria-label="Search commands"
        aria-expanded
        aria-controls="palette-list"
        aria-activedescendant={entries[current] && `palette-${entries[current].id}`}
        className="rounded-none border-0 border-b"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
        autoComplete="off"
      />
      <div id="palette-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto">
        {entries.map((e, i) => (
          // Keys go through the combobox; a click on an option is the pointer path.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <div
            key={e.id}
            id={`palette-${e.id}`}
            role="option"
            tabIndex={-1}
            aria-selected={i === current}
            className={cn('flex cursor-pointer items-center gap-2 px-4 py-2', i === current && 'bg-secondary')}
            onClick={() => run(e)}
          >
            <span className="grow">{e.label}</span>
            {e.keys !== undefined && <kbd className="font-mono text-caption text-muted-foreground">{e.keys}</kbd>}
            <span className="text-caption text-muted-foreground">{e.group}</span>
          </div>
        ))}
      </div>
    </dialog>
  );
}
