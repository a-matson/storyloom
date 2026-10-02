import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

const field = 'h-10 w-full rounded-md border border-border bg-bar px-3 text-foreground focus:border-lantern';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(field, 'pr-7', className)} {...props} />;
}
