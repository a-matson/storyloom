import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

const pillVariants = cva('inline-flex items-center rounded-full px-[7px] py-0.5 text-pill font-semibold uppercase tracking-[0.05em]', {
  variants: {
    tone: {
      plain: 'bg-secondary text-prose',
      do: 'bg-mode-do-bg text-mode-do',
      say: 'bg-mode-say-bg text-mode-say',
      story: 'bg-mode-story-bg text-mode-story',
      see: 'bg-mode-see-bg text-mode-see',
      auto: 'bg-mode-say-bg text-verdigris',
      warning: 'border border-warning text-warning',
    },
  },
  defaultVariants: { tone: 'plain' },
});

export function Pill({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof pillVariants>) {
  return <span className={cn(pillVariants({ tone }), className)} {...props} />;
}
