import { useEffect, useState } from 'react';
import { Button } from './button';
import { cn } from '@ui/lib/utils';

/** Long enough to read a line, short enough not to sit over the command row. [provisional] */
const TOAST_MS = 5000;

interface Props {
  message: string;
  error?: boolean;
  /** Without it the toast is a passive status message with no dismiss button. */
  onDismiss?: (() => void) | undefined;
}

export function Toast({ message, error = false, onDismiss }: Props) {
  const [paused, setPaused] = useState(false);
  // Errors wait for the user; everything else goes away on its own, unless pointed at or focused.
  const expires = error ? undefined : onDismiss;
  useEffect(() => {
    const t = !expires || paused ? undefined : window.setTimeout(expires, TOAST_MS);
    return () => window.clearTimeout(t);
  }, [expires, paused]);

  const Tag = error ? 'div' : 'output';
  const hold = () => setPaused(true);
  const release = () => setPaused(false);
  return (
    <Tag
      role={error ? 'alert' : undefined}
      className={cn(
        'fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-secondary px-3.5 py-2.5 text-control',
        error ? 'border-danger' : 'border-border',
      )}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      {message}
      {onDismiss && (
        <Button variant="ghost" className="ml-2 h-6" onClick={onDismiss}>
          dismiss
        </Button>
      )}
    </Tag>
  );
}
