import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@ui/lib/utils';
import { IconClose } from '@ui/components/Icons';
import { Button } from './button';

interface Props {
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * Right-hand modal panel on a native <dialog>: focus trap, Escape and an inert page come from the browser;
 * `closedby="any"` adds backdrop-click dismissal where supported.
 */
export function Drawer({ label, onClose, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      {...{ closedby: 'any' }}
      className={cn(
        'fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(720px,100vw)] max-w-none flex-col border-0 border-l border-border bg-card p-0 text-foreground',
        'shadow-[-20px_0_60px_rgba(0,0,0,0.4)] backdrop:bg-[rgba(0,0,0,0.35)] open:flex',
        className,
      )}
    >
      {children}
    </dialog>
  );
}

export function DrawerHeader({ title, children, onClose }: { title: ReactNode; children?: ReactNode; onClose: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-6 pt-[18px] pb-3.5">
      {title}
      <span className="grow" />
      {children}
      <Button size="icon" className="size-8" aria-label="Close" onClick={onClose}>
        <IconClose />
      </Button>
    </header>
  );
}

export function DrawerBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex grow flex-col gap-3.5 overflow-y-auto px-6 py-[18px]', className)} {...props} />;
}

/** Two or three mutually exclusive views in a drawer header. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-bar p-[3px]">
      {options.map((o) => (
        <Button
          key={o.id}
          variant="ghost"
          aria-pressed={value === o.id}
          className={cn('h-7 border-none', value === o.id ? 'bg-secondary' : 'bg-transparent')}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
