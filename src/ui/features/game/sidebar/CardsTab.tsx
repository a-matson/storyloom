import { useState } from 'react';
import type { Adventure, StoryCard } from '@core/model';
import { MAX_STORY_CARDS } from '@core/cards';
import type { Provider } from '@core/ports';
import { tokenizer } from '@app/services';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { CardDialog } from '@ui/components/CardDialog';
import { SECTION, SECTION_HEADER } from './Section';

const tone = (type: string) => (type.toLowerCase() === 'character' ? 'do' : type.toLowerCase() === 'location' ? 'say' : 'plain');

function CardRow({ card, onOpen }: { card: StoryCard; onOpen: () => void }) {
  return (
    <button type="button" className={`${SECTION} p-0 text-left`} aria-label={`Edit story card ${card.name}`} onClick={onOpen}>
      <div className={`${SECTION_HEADER} cursor-pointer`}>
        <Pill tone={tone(card.type)}>{card.type}</Pill>
        <span className="grow truncate">{card.name === '' ? '(unnamed)' : card.name}</span>
        <span className="max-w-35 truncate font-mono text-caption text-muted-foreground">{card.triggers.join(',')}</span>
        <span className="font-mono text-caption text-muted-foreground">{tokenizer.count(card.entry)}</span>
      </div>
    </button>
  );
}

export function CardsTab({ adventure, api, provider }: { adventure: Adventure; api: GameApi; provider: Provider }) {
  const cards = adventure.storyCards;
  const [editing, setEditing] = useState<StoryCard | 'new' | null>(null);
  // Bumped on every open so the dialog remounts with fresh state (speed-create "Next").
  const [dialogKey, setDialogKey] = useState(0);
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle === '' ? cards : cards.filter((c) => `${c.name} ${c.type} ${c.triggers.join(' ')} ${c.entry}`.toLowerCase().includes(needle));

  const save = (card: StoryCard, next?: 'close' | 'new') => {
    // An emptied entry deletes the card.
    if (card.entry === '') {
      api.setStoryCards(cards.filter((c) => c.id !== card.id));
      setEditing(null);
      return;
    }
    const exists = cards.some((c) => c.id === card.id);
    api.setStoryCards(exists ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card]);
    setEditing(next === 'new' ? 'new' : null);
    if (next === 'new') setDialogKey((k) => k + 1);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Input className="h-8 text-caption" aria-label="Filter cards" placeholder="Filter cards" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button variant="primary" className="h-8" onClick={() => setEditing('new')} disabled={cards.length >= MAX_STORY_CARDS}>
          + New
        </Button>
      </div>
      {cards.length === 0 && (
        <p className="text-caption text-muted-foreground">
          No story cards yet. Cards are sent to the AI only when one of their triggers appears in recent actions.
        </p>
      )}
      {shown.map((c) => (
        <CardRow key={c.id} card={c} onOpen={() => setEditing(c)} />
      ))}
      {editing !== null && (
        <CardDialog
          key={dialogKey}
          adventure={adventure}
          provider={provider}
          card={editing === 'new' ? undefined : editing}
          onSave={save}
          onSettings={api.setCardGenerator}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
