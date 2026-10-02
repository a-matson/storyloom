import { useState } from 'react';
import type { Adventure, StoryCard } from '@core/model';
import { newId } from '@core/model';
import { DEFAULT_GENERATOR_SETTINGS, generateStoryCard, normaliseTriggers, parseTriggers } from '@core/cards';
import type { Provider } from '@core/ports';

export const CARD_TYPES = ['Character', 'Class', 'Race', 'Location', 'Faction', 'Custom'];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const orUndefined = (s: string) => (s === '' ? undefined : s);

/** Form state for one story card, plus AI generation of name/entry/triggers. */
export function useCardDraft(adventure: Adventure, provider: Provider, card: StoryCard | undefined) {
  const settings = adventure.cardGenerator ?? DEFAULT_GENERATOR_SETTINGS;
  const custom = card !== undefined && (!CARD_TYPES.includes(card.type) || card.type === 'Custom');
  const [type, setType] = useState(card?.type ?? 'Character');
  const [customType, setCustomType] = useState(custom ? card.type : '');
  const [name, setName] = useState(card?.name ?? '');
  const [entry, setEntry] = useState(card?.entry ?? '');
  const [triggers, setTriggers] = useState(card?.triggers.join(',') ?? '');
  const [notes, setNotes] = useState(card?.notes ?? '');
  const [busy, setBusy] = useState<'name' | 'entry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveType = type === 'Custom' ? (orUndefined(customType.trim()) ?? 'Custom') : type;

  // "name" regenerates name + entry + triggers; "entry" rewrites the entry for the current name.
  const generate = async (what: 'name' | 'entry') => {
    setBusy(what);
    setError(null);
    const request = { type: effectiveType, name: what === 'entry' ? orUndefined(name.trim()) : undefined, settings, storySummary: adventure.plot.storySummary };
    const result = await generateStoryCard(request, { provider, template: adventure.settings.template }).then(
      (g) => ({ ok: true as const, g }),
      (e: unknown) => ({ ok: false as const, error: message(e) }),
    );
    setBusy(null);
    if (!result.ok) return setError(result.error);
    const { g } = result;
    if (what === 'name') {
      setName(g.name);
      setTriggers(g.triggers.join(','));
    } else if (triggers.trim() === '') {
      setTriggers(normaliseTriggers(g.triggers, orUndefined(name.trim()) ?? g.name).join(','));
    }
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
    selectable: card?.selectable,
  });

  const fields = { type, customType, name, entry, triggers, notes };
  const set = { setType, setCustomType, setName, setEntry, setTriggers, setNotes };
  const canSave = entry.trim() !== '' && parseTriggers(triggers).length > 0;
  return { settings, fields, set, busy, error, generate, build, canSave };
}

export type CardDraft = ReturnType<typeof useCardDraft>;
