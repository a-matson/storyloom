import { useState } from 'react';
import { lineEdits } from '@app/session/lines';
import { current } from '@core/memory';
import type { Assertion } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { Switch } from '@ui/components/ui/switch';

const INPUT = 'h-8 min-w-0 grow text-caption';

/**
 * A text field that writes once, on blur or Enter, and only when the text changed. Not keyed by `value`: a blur
 * write would remount the row under the click that caused it. The drawer is modal and mounts fresh on each open.
 */
export function CommitInput({ value, label, placeholder, onCommit }: { value: string; label: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => draft.trim() !== value && onCommit(draft.trim());
  return (
    <Input
      className={INPUT}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

/** One key: its value, and a lock the story cannot change. */
export function KeyRow({ api, id, k, value, locked }: { api: GameApi; id: string; k: string; value: string; locked: boolean }) {
  const [draft, setDraft] = useState(value);
  const edits = lineEdits(api);
  const commit = () => {
    if (draft.trim() === value) return;
    if (locked) edits.lock(id, k, draft.trim());
    else edits.setValue(id, k, draft.trim());
  };
  return (
    <div className="flex items-center gap-2 text-caption">
      <span className="w-14 shrink-0 text-muted-foreground">{k}</span>
      <Input
        className={INPUT}
        aria-label={k}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {locked && <Pill>Canon</Pill>}
      <Switch
        aria-label={`Lock ${k}`}
        checked={locked}
        disabled={!locked && !draft.trim()}
        onChange={(on) => (on ? edits.lock(id, k, draft.trim()) : edits.unlock(id, k))}
      />
    </div>
  );
}

/** Current relationships and an add row. */
export function Relationships({ api, id, own }: { api: GameApi; id: string; own: readonly Assertion[] }) {
  const [to, setTo] = useState('');
  const [stance, setStance] = useState('');
  const add = () => {
    if (!to.trim() || !stance.trim()) return;
    lineEdits(api).addLine(id, { kind: 'relationship', to: to.trim(), stance: stance.trim() });
    setTo('');
    setStance('');
  };
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-caption empty:hidden">
        {current(own, 'relationship').map((a) => (
          <li key={a.id}>
            {a.to}: {a.stance}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input className={INPUT} aria-label="Relationship to" placeholder="Who" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input
          className={INPUT}
          aria-label="Stance"
          placeholder="Stance, then Enter"
          value={stance}
          onChange={(e) => setStance(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </div>
    </>
  );
}
