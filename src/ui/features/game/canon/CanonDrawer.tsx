import { lineEdits } from '@app/session/lines';
import { current, currentStates, identityText, indexAssertions } from '@core/memory';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { SectionLabel } from '@ui/components/ui/section-label';
import { BeatsRow } from '../entities/cards/BeatsRow';
import { SecretsList } from '../entities/SecretsList';
import { SECTION, SECTION_BODY, SECTION_HEADER } from '../sidebar/Section';
import { CommitInput, KeyRow, Relationships } from './CanonRows';

// The closed keys (`CLOSED_KEYS`, not in the barrel) plus two free-text ones.
const KEYS = ['species', 'eyes', 'horns', 'hair', 'build'];

function CharacterCanon({ e, adventure, api }: { e: Entity; adventure: Adventure; api: GameApi }) {
  const own = indexAssertions(adventure.assertions).of(e.id);
  const now = currentStates(own);
  const edits = lineEdits(api);
  const identity = identityText(e, own);
  const voice = current(own, 'voice').at(-1)?.text ?? '';
  return (
    <section className={SECTION} aria-label={e.name}>
      <header className={SECTION_HEADER}>{e.name}</header>
      <div className={SECTION_BODY}>
        <CommitInput value={identity} label={`Who ${e.name} is`} placeholder="Who they are" onCommit={(t) => edits.setIdentity(e.id, t)} />
        {KEYS.map((k) => (
          <KeyRow key={k} api={api} id={e.id} k={k} value={now[k] ?? ''} locked={e.canonKeys?.includes(k) ?? false} />
        ))}
        <SectionLabel>Relationships</SectionLabel>
        <Relationships api={api} id={e.id} own={own} />
        <CommitInput value={voice} label={`${e.name}'s voice`} placeholder="How they speak" onCommit={(t) => edits.setVoice(e.id, t)} />
        <SectionLabel>Beats</SectionLabel>
        <BeatsRow entity={e} adventure={adventure} onSet={(b) => edits.setBeats(e.id, b)} />
      </div>
    </section>
  );
}

/** Who is who, gathered per character from the card's own writes; opened before turn 1 and from Plot. */
export function CanonDrawer({ adventure, api, onClose }: { adventure: Adventure; api: GameApi; onClose: () => void }) {
  const cast = adventure.entities.filter((e) => e.kind === 'character').toSorted((a, b) => Number(!!b.canon) - Number(!!a.canon) || a.firstSeen - b.firstSeen);
  return (
    <Drawer label="Canon" onClose={onClose}>
      <DrawerHeader title={<span className="text-card-title font-semibold">Canon</span>} onClose={onClose} />
      <DrawerBody>
        {cast.map((e) => (
          <CharacterCanon key={e.id} e={e} adventure={adventure} api={api} />
        ))}
        <CommitInput
          key={cast.length}
          value=""
          label="Add a character"
          placeholder="+ Character, then Enter"
          onCommit={(n) => n && lineEdits(api).addCharacter(n)}
        />
        <p className="m-0 text-caption text-muted-foreground">Mark a secret: select it in the story, then the action's pill.</p>
        <SecretsList adventure={adventure} api={api} />
      </DrawerBody>
    </Drawer>
  );
}
