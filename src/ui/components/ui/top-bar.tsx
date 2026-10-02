import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

export function TopBar({ className, ...props }: ComponentProps<'header'>) {
  return <header className={cn('flex h-14 shrink-0 items-center gap-4 border-b border-border bg-bar px-6 max-sm:gap-2 max-sm:px-3', className)} {...props} />;
}

export function TopBarTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('font-display text-screen-title leading-[1.2] font-medium', className)} {...props} />;
}
