import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

/** 11 px uppercase caption above a group. */
export function SectionLabel({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('text-label font-semibold uppercase tracking-[0.06em] text-muted-foreground', className)} {...props} />;
}
