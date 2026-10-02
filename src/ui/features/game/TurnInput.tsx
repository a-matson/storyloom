import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@ui/lib/utils';
import { IconSend, IconStop } from '@ui/components/Icons';
import { MODES, type Mode } from './modes';

interface Props {
  mode: Mode;
  text: string;
  busy: boolean;
  onText: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onStop: () => void;
}

const send = 'inline-flex size-9 items-center justify-center rounded-[9px] border-none text-lantern-ink';

export function TurnInput({ mode, text, busy, onText, onKeyDown, onSend, onStop }: Props) {
  const m = MODES[mode];
  const inputRef = useRef<HTMLInputElement>(null);
  // Back to typing as soon as a turn ends.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  return (
    <>
      <label htmlFor="turn-input" className="sr-only">
        Take a turn
      </label>
      <div className={cn('flex h-12 grow items-center gap-2.5 rounded-lg border border-border bg-card pr-2 pl-4', m.focus)}>
        <span className={cn('font-display text-screen-title', m.text)} aria-hidden>
          {m.prefix}
        </span>
        <input
          id="turn-input"
          ref={inputRef}
          className="h-11 min-w-0 grow border-none bg-transparent font-prose text-[17px] outline-none"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={m.hint}
          disabled={busy}
          autoComplete="off"
        />
        {busy ? (
          <button type="button" className={cn(send, 'bg-danger')} aria-label="Stop generating" onClick={onStop}>
            <IconStop />
          </button>
        ) : (
          <button type="button" className={cn(send, m.bg)} aria-label="Send" onClick={onSend}>
            <IconSend />
          </button>
        )}
      </div>
    </>
  );
}
