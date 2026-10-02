import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-border bg-card p-4', className)} {...props} />;
}
