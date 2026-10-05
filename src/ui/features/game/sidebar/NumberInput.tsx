import { useState } from 'react';

const NUMBER_INPUT = 'h-8 w-[84px] rounded-sm border border-border bg-bar px-2 font-mono text-caption';

/**
 * A number field that never writes an out-of-range value: the draft string lets you clear and
 * retype, while only a value inside [min, max] is committed, and a blur clamps what is left.
 * Blank commits `undefined` when the setting is optional, otherwise it keeps the stored value.
 */
export function NumberInput({
  id,
  value,
  min,
  max,
  step,
  optional,
  onCommit,
}: {
  id: string;
  value: number | undefined;
  min: number;
  max?: number | undefined;
  step: number;
  optional?: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const stored = value === undefined ? '' : String(value);
  const inRange = (n: number) => Number.isFinite(n) && n >= min && (max === undefined || n <= max);
  return (
    <input
      id={id}
      className={NUMBER_INPUT}
      type="number"
      step={step}
      min={min}
      max={max}
      value={draft ?? stored}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') return optional ? onCommit(undefined) : undefined;
        const n = Number(raw);
        if (inRange(n)) onCommit(n);
      }}
      onBlur={() => {
        const raw = draft;
        setDraft(null);
        if (raw === null || raw.trim() === '') return;
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (!inRange(n)) onCommit(Math.min(max ?? Infinity, Math.max(min, n)));
      }}
    />
  );
}
