import { useId, useState } from 'react';
// Not through the barrel: that would pull the session out of the start-up chunk into a shared one.
import { entityEdits } from '@app/session/entities';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { Input, Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Pill } from '@ui/components/ui/pill';
import { Textarea } from '@ui/components/ui/textarea';
import { pickFile } from '@ui/transferUi';
import { Avatar } from './Avatar';
import { Facts, StateRows, type Update } from './EntityDetails';

interface Props {
  entity: Entity;
  adventure: Adventure;
  api: GameApi;
  onClose: () => void;
}

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

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
            <Avatar name={e.name} adventureId={adventure.id} portraitId={e.portraitId} large />
            <span className="text-card-title font-semibold">{e.name}</span>
            {e.canon && <Pill title="Seeded from a scenario card">canon</Pill>}
          </span>
        }
        onClose={onClose}
      />
      <DrawerBody>
        <Portrait entity={e} edits={edits} />
        <label htmlFor={`${id}-name`}>
          <SectionLabel>Name</SectionLabel>
        </label>
        <Input id={`${id}-name`} defaultValue={e.name} onBlur={(ev) => rename(ev.target.value.trim())} />
        <label htmlFor={`${id}-desc`}>
          <SectionLabel>Description</SectionLabel>
        </label>
        <Textarea id={`${id}-desc`} defaultValue={e.description} onBlur={(ev) => update({ description: ev.target.value.trim() })} />
        <label htmlFor={`${id}-looks`}>
          <SectionLabel>Looks</SectionLabel>
        </label>
        <Input id={`${id}-looks`} defaultValue={e.appearance ?? ''} onBlur={(ev) => update({ appearance: ev.target.value.trim() })} />
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

type Edits = ReturnType<typeof entityEdits>;

/** Drawn between turns when an image server is configured; these are the player's overrides. */
function Portrait({ entity: e, edits }: { entity: Entity; edits: Edits }) {
  const [drawing, setDrawing] = useState(false);
  const regenerate = () => {
    setDrawing(true);
    void edits.regeneratePortrait(e.id).finally(() => setDrawing(false));
  };
  const upload = async () => {
    const file = await pickFile('image/*');
    if (file) await edits.uploadPortrait(e.id, file);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SectionLabel>Portrait</SectionLabel>
      <Button className="h-7" onClick={regenerate} disabled={drawing}>
        {drawing ? 'Drawing…' : e.portraitId ? 'Redraw' : 'Draw'}
      </Button>
      <Button className="h-7" onClick={() => void upload()}>
        Upload
      </Button>
      {e.portraitId && (
        <Button variant="ghost" className="h-7" onClick={() => edits.clearPortrait(e.id)}>
          Clear
        </Button>
      )}
    </div>
  );
}

function Actions({ entity: e, adventure, edits }: { entity: Entity; adventure: Adventure; edits: Edits }) {
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
