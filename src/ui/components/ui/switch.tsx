import type { ComponentProps } from 'react';
import { cn } from '@ui/lib/utils';

type Props = Omit<ComponentProps<'button'>, 'onChange'> & { checked: boolean; onChange: (checked: boolean) => void };

/** On/off toggle; name it with `aria-label` or a `<label htmlFor>`. */
export function Switch({ checked, onChange, className, ...props }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-5 w-[34px] items-center rounded-[10px] border-none bg-border p-0.5 aria-checked:bg-verdigris',
        'after:size-4 after:rounded-full after:bg-muted-foreground after:transition-transform after:duration-120 after:content-[""]',
        'aria-checked:after:translate-x-3.5 aria-checked:after:bg-background',
        className,
      )}
      {...props}
    />
  );
}
