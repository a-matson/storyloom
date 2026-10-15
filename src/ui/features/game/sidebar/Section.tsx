import { useState, type ReactNode } from 'react';
import { IconChevron } from '@ui/components/Icons';
import { InfoTip } from '@ui/components/ui/info-tip';
import { cn } from '@ui/lib/utils';

export const SECTION = 'rounded-[10px] border border-border bg-secondary';
export const SECTION_HEADER = 'flex items-center gap-2 px-3 py-2.5 text-control font-semibold';
export const SECTION_BODY = 'flex flex-col gap-2 px-3 pb-3';
/** Toggle chip; `aria-pressed` marks the chosen one. */
export const CHIP =
  'h-7 rounded-full border border-border bg-transparent px-2.5 text-caption font-medium text-muted-foreground aria-pressed:border-lantern aria-pressed:bg-secondary aria-pressed:text-foreground';

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

/** Ids of a setting's help and warning, for the control's `aria-describedby`. */
export const describedBy = (id: string, help?: string, warn?: string) => [help && `${id}-help`, warn && `${id}-warn`].filter(Boolean).join(' ') || undefined;

interface SettingProps {
  label: string;
  htmlFor: string;
  /** What it does, its default, when to change it. */
  help?: string | undefined;
  /** Shown only while the value is risky. */
  warn?: string | undefined;
  children: ReactNode;
}

/** Label + control row. */
export function Setting({ label, htmlFor, help, warn, children }: SettingProps) {
  return (
    <>
      <div className="relative flex items-center gap-2.5 text-control">
        <span className="flex grow items-center gap-1.5">
          <label htmlFor={htmlFor}>{label}</label>
          {help !== undefined && <InfoTip id={`${htmlFor}-help`} text={help} />}
        </span>
        {children}
      </div>
      {warn !== undefined && (
        <p role="note" id={`${htmlFor}-warn`} className="-mt-1 text-caption text-warning">
          {warn}
        </p>
      )}
    </>
  );
}
