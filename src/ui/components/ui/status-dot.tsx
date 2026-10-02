import { cn } from '@ui/lib/utils';

const TONE = { unknown: 'bg-neutral', ok: 'bg-success', busy: 'bg-warning', bad: 'bg-danger' } as const;

export function StatusDot({ status }: { status: keyof typeof TONE }) {
  return <span className={cn('size-2 shrink-0 rounded-full', TONE[status])} />;
}
