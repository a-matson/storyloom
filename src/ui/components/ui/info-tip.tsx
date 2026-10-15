import { useState } from 'react';
import { cn } from '@ui/lib/utils';

/**
 * A small "i" that explains the setting beside it. Hover or keyboard focus shows it; a tap toggles
 * it, since iOS Safari does not focus a tapped button. The tooltip sits under the nearest
 * positioned ancestor (the setting row), so it never runs off a phone screen.
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
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          setOpen(false);
          e.currentTarget.blur();
        }}
        className="peer inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted-foreground font-mono text-pill leading-none font-semibold text-background"
      >
        i
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          'absolute inset-x-0 top-full z-20 mt-1 hidden rounded-sm border border-border bg-bar px-2 py-1.5 text-caption text-foreground shadow-md',
          'peer-hover:block peer-focus-visible:block',
          open && 'block',
        )}
      >
        {text}
      </span>
    </>
  );
}
