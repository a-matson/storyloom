import { useState, type ReactNode } from 'react';
import { IconChevron } from '@ui/components/Icons';
import { cn } from '@ui/lib/utils';

export const SECTION = 'rounded-[10px] border border-border bg-secondary';
export const SECTION_HEADER = 'flex items-center gap-2 px-3 py-2.5 text-control font-semibold';
export const SECTION_BODY = 'flex flex-col gap-2 px-3 pb-3';

interface Props {
  title: string;
  tokens?: number;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Collapsible group; native <details> gives keyboard and screen-reader support. */
export function Section({ title, tokens, badge, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={SECTION} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={cn(SECTION_HEADER, 'cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden')}>
        <IconChevron open={open} />
        <span className="grow">{title}</span>
        {badge}
        {tokens !== undefined && <span className="font-mono text-caption text-muted-foreground">{tokens} tok</span>}
      </summary>
      <div className={SECTION_BODY}>{children}</div>
    </details>
  );
}

/** Label + control row. */
export function Setting({ label, htmlFor, title, children }: { label: string; htmlFor: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-control">
      <label htmlFor={htmlFor} title={title} className="grow">
        {label}
      </label>
      {children}
    </div>
  );
}
