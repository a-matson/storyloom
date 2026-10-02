import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Our type scale is custom; without it tailwind-merge reads `text-caption` as a colour and drops it next to `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['pill', 'label', 'caption', 'control', 'body', 'card-title', 'screen-title', 'heading', 'title'] } },
});

/** Joins classes; later Tailwind utilities override conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
