import type { ReactNode } from 'react';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Textarea } from '@ui/components/ui/textarea';
import { CARD_TYPES, type CardDraft } from './useCardDraft';

function Field({ id, label, hint, action, children }: { id: string; label: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="flex items-center gap-2">
        <SectionLabel>{label}</SectionLabel>
        {hint !== undefined && <span className="text-caption text-muted-foreground">{hint}</span>}
        <span className="grow" />
        {action}
      </span>
      {children}
    </label>
  );
}

function GenerateButton({ draft, what }: { draft: CardDraft; what: 'name' | 'entry' }) {
  return (
    <Button className="h-7 text-caption" disabled={draft.busy !== null} onClick={() => void draft.generate(what)}>
      {draft.busy === what ? 'Generating…' : 'Generate new'}
    </Button>
  );
}

/** Type, Name, Entry, Triggers, Notes; "Generate new" on Name and Entry. */
export function CardDetails({ draft }: { draft: CardDraft }) {
  const { fields: f, set } = draft;
  return (
    <>
      <div className="flex items-center gap-2.5">
        <Field id="card-type" label="Type">
          <Select id="card-type" className="w-40" value={CARD_TYPES.includes(f.type) ? f.type : 'Custom'} onChange={(e) => set.setType(e.target.value)}>
            {CARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        {f.type === 'Custom' && (
          <div className="grow">
            <Field id="card-custom" label="Custom type">
              <Input id="card-custom" value={f.customType} onChange={(e) => set.setCustomType(e.target.value)} placeholder="Item, Event, Spell…" />
            </Field>
          </div>
        )}
      </div>
      <Field id="card-name" label="Name" hint="for you only — the AI never sees it" action={<GenerateButton draft={draft} what="name" />}>
        <Input id="card-name" value={f.name} onChange={(e) => set.setName(e.target.value)} placeholder="Merav" />
      </Field>
      <Field id="card-entry" label="Entry" hint="what the AI sees when triggered — mention the name" action={<GenerateButton draft={draft} what="entry" />}>
        <Textarea
          id="card-entry"
          className="min-h-30"
          value={f.entry}
          onChange={(e) => set.setEntry(e.target.value)}
          placeholder="Merav leads the caravan. She is blind at night and hides it."
        />
      </Field>
      <Field id="card-triggers" label="Triggers" hint="comma-separated, case-insensitive, spaces matter">
        <Input
          id="card-triggers"
          className="font-mono text-caption"
          value={f.triggers}
          onChange={(e) => set.setTriggers(e.target.value)}
          placeholder="merav,lead rider"
        />
      </Field>
      <Field id="card-notes" label="Notes (never sent to the AI)">
        <Textarea id="card-notes" className="min-h-15" value={f.notes} onChange={(e) => set.setNotes(e.target.value)} />
      </Field>
      {draft.error !== null && <p className="m-0 text-caption text-danger">{draft.error}</p>}
    </>
  );
}
