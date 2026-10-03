import { useState } from 'react';
import type { StoryCard, TemplateId } from '@core/model';
import { newId } from '@core/model';
import { generateStoryCard, parseTriggers, type CardGeneratorSettings } from '@core/cards';
import type { Provider } from '@core/ports';

export const CARD_TYPES = ['Character', 'Class', 'Race', 'Location', 'Faction', 'Custom'];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const orUndefined = (s: string) => (s === '' ? undefined : s);

/** What generation needs from the story; the game passes its adventure's, the scenario editor defaults. */
export interface CardContext {
  generator: CardGeneratorSettings;
  storySummary: string | undefined;
  plotEssentials?: string | undefined;
  /** Story tail (`recentStory`); the card's subject and triggers come from it. */
  recentStory?: string | undefined;
  /** The model generation runs on, resolved when the player asks for a card. */
  model: () => Promise<{ provider: Provider; template: TemplateId }>;
  /** Opened from a Character Creator scenario: cards can be made selectable. */
  creator?: boolean;
}

/** Form state for one story card, plus AI generation of name/entry/triggers. */
export function useCardDraft(context: CardContext, card: StoryCard | undefined) {
  const settings = context.generator;
  const custom = card !== undefined && (!CARD_TYPES.includes(card.type) || card.type === 'Custom');
  const [type, setType] = useState(card?.type ?? 'Character');
  const [customType, setCustomType] = useState(custom ? card.type : '');
  const [name, setName] = useState(card?.name ?? '');
  const [entry, setEntry] = useState(card?.entry ?? '');
  const [triggers, setTriggers] = useState(card?.triggers.join(',') ?? '');
  const [notes, setNotes] = useState(card?.notes ?? '');
  const [selectable, setSelectable] = useState(card?.selectable ?? false);
  const [busy, setBusy] = useState<'name' | 'entry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveType = type === 'Custom' ? (orUndefined(customType.trim()) ?? 'Custom') : type;

  // "name" regenerates name + entry + triggers; "entry" rewrites the entry for the current name.
  const generate = async (what: 'name' | 'entry') => {
    setBusy(what);
    setError(null);
    const request = {
      type: effectiveType,
      name: what === 'entry' ? orUndefined(name.trim()) : undefined,
      settings,
      storySummary: context.storySummary,
      plotEssentials: context.plotEssentials,
      recentStory: context.recentStory,
    };
    const result = await context
      .model()
      .then((model) => generateStoryCard(request, model))
      .then(
        (g) => ({ ok: true as const, g }),
        (e: unknown) => ({ ok: false as const, error: message(e) }),
      );
    setBusy(null);
    if (!result.ok) return setError(result.error);
    const { g } = result;
    if (what === 'name') setName(g.name);
    if (what === 'name' || triggers.trim() === '') setTriggers(g.triggers.join(','));
    setEntry(g.entry);
    if (settings.logToNotes) setNotes((n) => `${n === '' ? '' : `${n}\n\n`}— generated ${new Date().toLocaleTimeString()} —\n${g.entry}`);
  };

  const build = (): StoryCard => ({
    id: card?.id ?? newId('card_'),
    type: effectiveType,
    name: orUndefined(name.trim()) ?? effectiveType,
    entry: entry.trim(),
    triggers: parseTriggers(triggers),
    notes: orUndefined(notes.trim()),
    selectable: selectable || undefined,
  });

  const fields = { type, customType, name, entry, triggers, notes, selectable };
  const set = { setType, setCustomType, setName, setEntry, setTriggers, setNotes, setSelectable };
  const canSave = entry.trim() !== '' && parseTriggers(triggers).length > 0;
  return { settings, creator: context.creator === true, fields, set, busy, error, generate, build, canSave };
}

export type CardDraft = ReturnType<typeof useCardDraft>;
