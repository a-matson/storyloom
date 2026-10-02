import { useId } from 'react';
import type { Scenario } from '@core/model';
import { tokenizer } from '@app/services';
import { Textarea } from '@ui/components/ui/textarea';
import { cn } from '@ui/lib/utils';

export interface TabProps {
  draft: Scenario;
  update: (patch: Partial<Scenario>) => void;
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Show a token estimate next to the label. */
  tokens?: boolean;
}

/** Labelled textarea with an optional hint and token count. */
export function TextField({ label, hint, value, onChange, className, tokens = false }: FieldProps) {
  const id = useId();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2.5">
        <label htmlFor={id} className="text-control font-semibold">
          {label}
        </label>
        {hint !== undefined && <span className="text-caption text-muted-foreground">{hint}</span>}
        <span className="grow" />
        {tokens && <span className="font-mono text-label text-muted-foreground">{tokenizer.count(value)} tok</span>}
      </div>
      <Textarea id={id} className={cn('text-control', className)} value={value} onChange={(e) => onChange(e.target.value)} />
    </section>
  );
}
