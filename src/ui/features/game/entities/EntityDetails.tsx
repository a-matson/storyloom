import { useId } from 'react';
import type { Entity, EntityFact } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { SectionLabel } from '@ui/components/ui/section-label';

export type Update = (patch: Partial<Entity>) => void;

/** Bring an action into view; the story column's children are the actions in order. */
const showAction = (index: number) => document.getElementById('story')?.children[index]?.scrollIntoView({ block: 'center' });

/** State values, each editable and lockable: a locked value is canon, and the memory cycle only flags a disagreement. */
export function StateRows({ entity: e, update }: { entity: Entity; update: Update }) {
  const id = useId();
  const entries = Object.entries(e.state);
  if (entries.length === 0) return null;
  const locked = new Set(e.canonKeys);
  const set = (k: string, value: string) => {
    const state = { ...e.state, [k]: value };
    update({ state: Object.fromEntries(Object.entries(state).filter(([, v]) => v !== '')) });
  };
  const lock = (k: string) => update({ canonKeys: locked.has(k) ? [...locked].filter((x) => x !== k) : [...locked, k] });
  return (
    <>
      <SectionLabel>State</SectionLabel>
      {entries.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-2 text-control">
          <label htmlFor={`${id}-${i}`} className="w-28 shrink-0 truncate text-muted-foreground">
            {k}
          </label>
          {/* Keyed by value: "Accept the story" changes it under an uncontrolled input. */}
          <Input key={v} id={`${id}-${i}`} className="h-8" defaultValue={v} onBlur={(ev) => ev.target.value.trim() !== v && set(k, ev.target.value.trim())} />
          <Button variant="ghost" className="h-7 shrink-0" aria-pressed={locked.has(k)} aria-label={`Lock ${k} as canon`} onClick={() => lock(k)}>
            {locked.has(k) ? 'Canon' : 'Lock'}
          </Button>
        </div>
      ))}
    </>
  );
}

export function Facts({ entity: e, update, onClose }: { entity: Entity; update: Update; onClose: () => void }) {
  const pin = (factId: string) => update({ facts: e.facts.map((f) => (f.id === factId ? { ...f, pinned: !f.pinned } : f)) });
  const without = (f: EntityFact) => e.facts.filter((x) => x.id !== f.id);
  // The player is the author: taking the story's side writes its value and unlocks the key.
  const accept = (f: EntityFact, { key, value }: { key: string; value: string }) =>
    update({ facts: without(f), state: { ...e.state, [key]: value }, canonKeys: (e.canonKeys ?? []).filter((k) => k !== key) });
  return (
    <>
      <SectionLabel>Facts</SectionLabel>
      {e.facts.length === 0 && <p className="m-0 text-caption text-muted-foreground">None yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {e.facts.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 text-control">
            <Button
              variant="ghost"
              className="h-7 shrink-0 font-mono text-caption"
              aria-label={`Show action ${f.fromAction} in the story`}
              onClick={() => {
                onClose();
                showAction(f.fromAction);
              }}
            >
              action {f.fromAction}
            </Button>
            {f.conflict && <Pill tone="see">conflict</Pill>}
            <span className="min-w-0 grow">{f.text}</span>
            {f.claim ? (
              <span className="flex gap-1">
                <Button className="h-7" onClick={() => update({ facts: without(f) })}>
                  Keep canon
                </Button>
                <Button className="h-7" onClick={() => f.claim && accept(f, f.claim)}>
                  Accept the story
                </Button>
              </span>
            ) : (
              <Button variant="ghost" className="h-7 shrink-0" aria-pressed={!!f.pinned} aria-label={`Pin: ${f.text}`} onClick={() => pin(f.id)}>
                {f.pinned ? 'Pinned' : 'Pin'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
