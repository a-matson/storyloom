import { Button } from './button';
import { cn } from '@ui/lib/utils';

interface Props {
  message: string;
  error?: boolean;
  onDismiss: () => void;
}

export function Toast({ message, error = false, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        'fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-md border bg-secondary px-3.5 py-2.5 text-control',
        error ? 'border-danger' : 'border-border',
      )}
    >
      {message}
      <Button variant="ghost" className="ml-2 h-6" onClick={onDismiss}>
        dismiss
      </Button>
    </div>
  );
}
