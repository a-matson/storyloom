import { useState } from 'react';
import { cn } from '@ui/lib/utils';

/**
 * A small "i" that explains the setting beside it. Hover, keyboard focus or a tap shows it (a tap
 * cannot rely on focus: iOS Safari does not focus a tapped button). The tooltip sits under the
 * nearest positioned ancestor (the setting row), so it never runs off a phone screen. State, not
 * `peer-*` variants: the start-up CSS budget has no room for them.
 */
export function InfoTip({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        // Not "About <label>": the label already precedes it, and that name would match other buttons' names.
        aria-label="Help"
        aria-describedby={id}
        onClick={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={(e) => setOpen(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          setOpen(false);
          e.currentTarget.blur();
        }}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border-none bg-muted-foreground p-0 font-mono text-pill font-semibold text-background"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          'absolute inset-x-0 top-full z-30 mt-1 rounded-sm border border-border bg-bar px-2 py-1.5 text-caption text-foreground',
          !open && 'hidden',
        )}
      >
        {text}
      </span>
    </>
  );
}
