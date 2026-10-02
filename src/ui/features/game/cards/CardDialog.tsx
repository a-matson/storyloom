import { useState } from 'react';
import type { Adventure, StoryCard } from '@core/model';
import type { CardGeneratorSettings } from '@core/cards';
import type { Provider } from '@core/ports';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader, Segmented } from '@ui/components/ui/drawer';
import { CardDetails } from './CardDetails';
import { GeneratorSettings } from './GeneratorSettings';
import { useCardDraft } from './useCardDraft';

interface Props {
  adventure: Adventure;
  provider: Provider;
  /** Existing card to edit; omit to create. */
  card?: StoryCard | undefined;
  onSave: (card: StoryCard, next?: 'close' | 'new') => void;
  onSettings: (s: CardGeneratorSettings) => void;
  onClose: () => void;
}

const VIEWS = [
  { id: 'details', label: 'Details' },
  { id: 'settings', label: 'Generator settings' },
] as const;

/** Story card create/edit with AI generation, following AI Dungeon's flow. */
export function CardDialog({ adventure, provider, card, onSave, onSettings, onClose }: Props) {
  const [view, setView] = useState<'details' | 'settings'>('details');
  const draft = useCardDraft(adventure, provider, card);
  const title = card ? 'Edit story card' : 'New story card';
  // Speed create keeps the dialog open for the next new card.
  const next = draft.settings.speedCreate && !card ? 'new' : 'close';
  return (
    <Drawer label={title} onClose={onClose} className="w-[min(640px,100vw)]">
      <DrawerHeader title={<div>{title}</div>} onClose={onClose}>
        <Segmented value={view} options={[...VIEWS]} onChange={setView} />
      </DrawerHeader>
      <DrawerBody>{view === 'details' ? <CardDetails draft={draft} /> : <GeneratorSettings settings={draft.settings} onChange={onSettings} />}</DrawerBody>
      <footer className="flex gap-2 border-t border-border px-6 py-3.5">
        {card && (
          <Button variant="ghost" danger onClick={() => onSave({ ...draft.build(), entry: '' }, 'close')} title="Remove this card">
            Delete
          </Button>
        )}
        <span className="grow" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!draft.canSave} onClick={() => onSave(draft.build(), next)}>
          {next === 'new' ? 'Next' : 'Finish'}
        </Button>
      </footer>
    </Drawer>
  );
}
