import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-control font-medium disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-foreground hover:border-neutral',
        primary: 'border-lantern bg-lantern font-semibold text-lantern-ink',
        ghost: 'border-border bg-transparent text-foreground hover:border-neutral',
        system: 'border-verdigris bg-secondary font-semibold text-verdigris',
      },
      size: {
        md: 'h-9 px-3.5',
        lg: 'h-11 rounded-lg px-4',
        icon: 'size-9 p-0',
      },
      // Ghost and filled buttons both come in a destructive colour.
      danger: { true: 'text-danger', false: '' },
    },
    defaultVariants: { variant: 'default', size: 'md', danger: false },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, danger, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, danger }), className)} {...props} />;
}
