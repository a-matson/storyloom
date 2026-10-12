import { useState, useSyncExternalStore } from 'react';
import { addRule, ruleEdits } from '@app/session/rules';
import type { Adventure, Rule } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { StatusDot } from '@ui/components/ui/status-dot';
import { Textarea } from '@ui/components/ui/textarea';
import { SECTION, SECTION_BODY } from '../sidebar/Section';

type Edits = ReturnType<typeof ruleEdits>;

/** One rule: text edited in place, gate chips, and Confirm for a story proposal. */
function RuleRow({ rule: r, adventure, edits, sent }: { rule: Rule; adventure: Adventure; edits: Edits; sent: boolean }) {
  const name = (id: string) => adventure.entities.find((e) => e.id === id)?.name ?? id;
  const free = adventure.entities.filter((e) => !r.gates.includes(e.id));
  return (
    <div className={`${SECTION} ${SECTION_BODY} pt-3`}>
      <div className="flex items-center gap-1.5">
        <span title={sent ? 'In the last prompt' : 'Not in the last prompt'} className="inline-flex">
          <StatusDot status={sent ? 'ok' : 'unknown'} />
        </span>
        <Pill>{r.source}</Pill>
        {r.status === 'proposed' && <Pill tone="warning">proposed</Pill>}
        <span className="grow" />
        {r.status === 'proposed' && (
          <Button className="h-7" onClick={() => edits.update(r.id, { status: 'confirmed' })}>
            Confirm
          </Button>
        )}
        <Button variant="ghost" className="h-7" aria-label={`Delete rule: ${r.text}`} onClick={() => edits.delete(r.id)}>
          Delete
        </Button>
      </div>
      <Textarea aria-label="Rule text" defaultValue={r.text} onBlur={(ev) => ev.target.value.trim() && edits.update(r.id, { text: ev.target.value.trim() })} />
      <div className="flex flex-wrap items-center gap-1.5 text-caption">
        <span className="text-muted-foreground">Sent with:</span>
        {r.gates.length === 0 && <span>always</span>}
        {r.gates.map((g) => (
          <Button
            key={g}
            variant="ghost"
            className="h-7"
            aria-label={`Remove gate ${name(g)}`}
            onClick={() => edits.update(r.id, { gates: r.gates.filter((x) => x !== g) })}
          >
            {name(g)} ✕
          </Button>
        ))}
        {free.length > 0 && (
          <Select
            aria-label="Add gate"
            className="h-7 w-auto"
            value=""
            onChange={(ev) => ev.target.value && edits.update(r.id, { gates: [...r.gates, ev.target.value] })}
          >
            <option value="">+ gate</option>
            {free.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}

/** World rules: sent as `[Rules: …]` while a gate is in play, always when ungated. */
export function RuleList({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const [draft, setDraft] = useState('');
  const used = useSyncExternalStore(api.subscribe, () => api.getSnapshot().context?.result.usedRuleIds);
  const edits = ruleEdits(api);
  const add = () => {
    void addRule(api, draft);
    setDraft('');
  };
  return (
    <>
      <form
        className="flex items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          add();
        }}
      >
        <Input className="h-8 text-caption" aria-label="New rule" placeholder="Kobolds fear fire" value={draft} onChange={(ev) => setDraft(ev.target.value)} />
        <Button type="submit" variant="primary" className="h-8" disabled={draft.trim() === ''}>
          + Add
        </Button>
      </form>
      {adventure.rules.length === 0 && (
        <p className="text-caption text-muted-foreground">
          No rules yet. A rule is sent while something it names is in the scene; one naming no one is always sent.
        </p>
      )}
      {adventure.rules.map((r) => (
        <RuleRow key={r.id} rule={r} adventure={adventure} edits={edits} sent={used?.includes(r.id) ?? false} />
      ))}
    </>
  );
}
