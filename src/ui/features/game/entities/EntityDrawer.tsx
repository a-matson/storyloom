import { useId, useState } from 'react';
// Not through the barrel: that would pull the session out of the start-up chunk into a shared one.
import { entityEdits } from '@app/session/entities';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { Input, Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Textarea } from '@ui/components/ui/textarea';
import { Avatar } from './Avatar';

interface Props {
  entity: Entity;
  adventure: Adventure;
  api: GameApi;
  onClose: () => void;
}

type Update = (patch: Partial<Entity>) => void;

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Bring an action into view; the story column's children are the actions in order. */
const showAction = (index: number) => document.getElementById('story')?.children[index]?.scrollIntoView({ block: 'center' });

/** One entity, edited in place: text fields commit on blur, an emptied state value removes it. */
export function EntityDrawer({ entity: e, adventure, api, onClose }: Props) {
  const id = useId();
  const edits = entityEdits(api);
  const update: Update = (patch) => edits.update(e.id, patch);
  // The old name stays an alias, so the story's later mentions still find this entry.
  const rename = (name: string) => name && name !== e.name && update({ name, aliases: [...e.aliases.filter((a) => a !== name), e.name] });

  return (
    <Drawer label={e.name} onClose={onClose}>
      <DrawerHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={e.name} large />
            <span className="text-card-title font-semibold">{e.name}</span>
          </span>
        }
        onClose={onClose}
      />
      <DrawerBody>
        <label htmlFor={`${id}-name`}>
          <SectionLabel>Name</SectionLabel>
        </label>
        <Input id={`${id}-name`} defaultValue={e.name} onBlur={(ev) => rename(ev.target.value.trim())} />
        <label htmlFor={`${id}-desc`}>
          <SectionLabel>Description</SectionLabel>
        </label>
        <Textarea id={`${id}-desc`} defaultValue={e.description} onBlur={(ev) => update({ description: ev.target.value.trim() })} />
        <label htmlFor={`${id}-aliases`}>
          <SectionLabel>Also called (comma-separated)</SectionLabel>
        </label>
        <Input id={`${id}-aliases`} defaultValue={e.aliases.join(', ')} onBlur={(ev) => update({ aliases: list(ev.target.value) })} />
        <StateRows entity={e} update={update} />
        <Facts entity={e} update={update} onClose={onClose} />
        {e.relations.length > 0 && <SectionLabel>Relations</SectionLabel>}
        {e.relations.map((r) => (
          <p key={`${r.to}|${r.label}`} className="m-0 text-control">
            {r.label} → {r.to}
          </p>
        ))}
        <Actions entity={e} adventure={adventure} edits={edits} />
      </DrawerBody>
    </Drawer>
  );
}

function StateRows({ entity: e, update }: { entity: Entity; update: Update }) {
  const id = useId();
  const entries = Object.entries(e.state);
  if (entries.length === 0) return null;
  const set = (k: string, value: string) => {
    const { [k]: _, ...rest } = e.state;
    update({ state: value ? { ...rest, [k]: value } : rest });
  };
  return (
    <>
      <SectionLabel>State</SectionLabel>
      {entries.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-2 text-control">
          <label htmlFor={`${id}-${i}`} className="w-28 shrink-0 truncate text-muted-foreground">
            {k}
          </label>
          <Input id={`${id}-${i}`} className="h-8" defaultValue={v} onBlur={(ev) => ev.target.value.trim() !== v && set(k, ev.target.value.trim())} />
        </div>
      ))}
    </>
  );
}

function Facts({ entity: e, update, onClose }: { entity: Entity; update: Update; onClose: () => void }) {
  const pin = (factId: string) => update({ facts: e.facts.map((f) => (f.id === factId ? { ...f, pinned: !f.pinned } : f)) });
  return (
    <>
      <SectionLabel>Facts</SectionLabel>
      {e.facts.length === 0 && <p className="m-0 text-caption text-muted-foreground">None yet.</p>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {e.facts.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-control">
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
            <span className="grow">{f.text}</span>
            <Button variant="ghost" className="h-7 shrink-0" aria-pressed={!!f.pinned} aria-label={`Pin: ${f.text}`} onClick={() => pin(f.id)}>
              {f.pinned ? 'Pinned' : 'Pin'}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Actions({ entity: e, adventure, edits }: { entity: Entity; adventure: Adventure; edits: ReturnType<typeof entityEdits> }) {
  const [into, setInto] = useState('');
  const [updating, setUpdating] = useState(false);
  const others = adventure.entities.filter((x) => x.id !== e.id);
  const promoted = !!e.cardId && adventure.storyCards.some((c) => c.id === e.cardId);
  const refresh = () => {
    setUpdating(true);
    void edits.refresh(e.id).finally(() => setUpdating(false));
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
        <Button onClick={() => void edits.promote(e.id)} disabled={promoted}>
          {promoted ? 'Is a story card' : 'Promote to story card'}
        </Button>
        <Button onClick={refresh} disabled={updating}>
          {updating ? 'Updating…' : 'Update from story'}
        </Button>
        <Button danger onClick={() => confirm(`Delete ${e.name}? This cannot be undone.`) && edits.delete(e.id)}>
          Delete
        </Button>
      </div>
      {others.length > 0 && (
        <div className="flex items-center gap-2">
          <Select aria-label="Merge into" className="h-8" value={into} onChange={(ev) => setInto(ev.target.value)}>
            <option value="">Merge into…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Button
            className="shrink-0"
            disabled={!into}
            onClick={() => {
              if (confirm(`Merge ${e.name} into the chosen entry? ${e.name} is deleted.`)) void edits.merge(into, e.id);
            }}
          >
            Merge
          </Button>
        </div>
      )}
    </>
  );
}
