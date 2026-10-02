import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn('min-h-23 w-full resize-y rounded-md border border-border bg-bar px-3 py-2.5 leading-normal text-prose focus:border-lantern', className)}
      {...props}
    />
  );
}
