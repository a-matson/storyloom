import { Button } from './button';
import { cn } from '@ui/lib/utils';

interface Props {
  message: string;
  error?: boolean;
  /** Without it the toast is a passive status message (<output>, the native status role). */
  onDismiss?: (() => void) | undefined;
}

export function Toast({ message, error = false, onDismiss }: Props) {
  const Tag = onDismiss ? 'div' : 'output';
  return (
    <Tag
      role={onDismiss ? 'alert' : undefined}
      className={cn(
        'fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-secondary px-3.5 py-2.5 text-control',
        error ? 'border-danger' : 'border-border',
      )}
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
