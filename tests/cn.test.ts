import { expect, it } from 'vitest';
import { cn } from '@ui/lib/utils';

it('keeps a custom font size next to a text colour', () => {
  expect(cn('text-control text-foreground', 'text-lantern')).toBe('text-control text-lantern');
  expect(cn('text-pill', 'text-caption')).toBe('text-caption');
});
