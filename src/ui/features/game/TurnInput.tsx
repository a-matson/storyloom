import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '@ui/lib/utils';
import { IconSend, IconStop } from '@ui/components/Icons';
import { MODES, type Mode } from './modes';

interface Props {
  mode: Mode;
  text: string;
  busy: boolean;
  onText: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  onFocusChange: (focused: boolean) => void;
}

const send = 'inline-flex size-9 items-center justify-center rounded-[9px] border-none text-lantern-ink';

export function TurnInput({ mode, text, busy, onText, onKeyDown, onSend, onStop, onFocusChange }: Props) {
  const m = MODES[mode];
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Back to typing as soon as a turn ends.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  return (
    <>
      <label htmlFor="turn-input" className="sr-only">
        Take a turn
      </label>
      <div
        className={cn(
          'flex min-h-12 grow items-end gap-2.5 rounded-lg border border-border bg-card py-1.25 pr-2 pl-4 transition-colors motion-reduce:transition-none',
          m.focus,
        )}
      >
        <span className={cn('font-display text-screen-title leading-9', m.text)} aria-hidden>
          {m.prefix}
        </span>
        {/* Grows with the text (`field-sizing`); Enter still sends, so it stays one logical line. */}
        <textarea
          id="turn-input"
          ref={inputRef}
          rows={1}
          /* the container wears the mode-coloured ring instead of the global 4 px one */
          className="max-h-40 min-w-0 grow resize-none border-none bg-transparent py-1.5 font-prose text-[17px] leading-6 outline-none field-sizing-content focus-visible:shadow-none"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
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
