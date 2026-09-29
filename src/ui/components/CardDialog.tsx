import { useState } from 'react';
import type { Adventure, StoryCard } from '@core/types';
import { newId } from '@core/types';
import { parseTriggers } from '@core/storyCards';
import { DEFAULT_GENERATOR_SETTINGS, generateStoryCard, normaliseTriggers, type CardGeneratorSettings } from '@core/cardGenerator';
import type { Provider } from '@providers/types';
import { IconClose } from './Icons';

const TYPES = ['Character', 'Class', 'Race', 'Location', 'Faction', 'Custom'];

interface Props {
  adventure: Adventure;
  provider: Provider;
  /** Existing card to edit; omit to create. */
  card?: StoryCard;
  onSave: (card: StoryCard, next?: 'close' | 'new') => void;
  onSettings: (s: CardGeneratorSettings) => void;
  onClose: () => void;
}

/**
 * Story card create/edit dialog with AI generation (AI Dungeon's flow):
 * Details tab — Type, Name, Entry, Triggers, Notes, "Generate new" on Name
 * (regenerates name+entry+triggers) and on Entry (entry only, from the Name).
 * Generator Settings tab — Speed Create, Include Story Summary, Log to Notes,
 * AI Instructions, Story Information (stored per adventure).
 */
export function CardDialog({ adventure, provider, card, onSave, onSettings, onClose }: Props) {
  const [tab, setTab] = useState<'details' | 'settings'>('details');
  const settings = adventure.cardGenerator ?? DEFAULT_GENERATOR_SETTINGS;
  const isCustom = (t: string) => !TYPES.includes(t) || t === 'Custom';
  const [type, setType] = useState(card?.type ?? 'Character');
  const [customType, setCustomType] = useState(card && isCustom(card.type) ? card.type : '');
  const [name, setName] = useState(card?.name ?? '');
  const [entry, setEntry] = useState(card?.entry ?? '');
  const [triggers, setTriggers] = useState(card?.triggers.join(',') ?? '');
  const [notes, setNotes] = useState(card?.notes ?? '');
  const [busy, setBusy] = useState<'name' | 'entry' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveType = type === 'Custom' ? customType.trim() || 'Custom' : type;

  const generate = async (what: 'name' | 'entry') => {
    setBusy(what);
    setError(null);
    try {
      const g = await generateStoryCard(
        { type: effectiveType, name: what === 'entry' ? name.trim() || undefined : undefined, settings, storySummary: adventure.plot.storySummary },
        { provider, template: adventure.settings.template },
      );
      if (what === 'name') {
        setName(g.name);
        setTriggers(g.triggers.join(','));
      } else if (!triggers.trim()) {
        setTriggers(normaliseTriggers(g.triggers, name.trim() || g.name).join(','));
      }
      setEntry(g.entry);
      if (settings.logToNotes) setNotes((n) => `${n ? `${n}\n\n` : ''}— generated ${new Date().toLocaleTimeString()} —\n${g.entry}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const build = (): StoryCard => ({
    id: card?.id ?? newId('card_'),
    type: effectiveType,
    name: name.trim() || effectiveType,
    entry: entry.trim(),
    triggers: parseTriggers(triggers),
    notes: notes.trim() || undefined,
    selectable: card?.selectable,
  });

  const canSave = entry.trim().length > 0 && parseTriggers(triggers).length > 0;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label={card ? 'Edit story card' : 'New story card'} style={{ width: 'min(640px, 100vw)' }}>
        <header>
          <div className="topbar title" style={{ height: 'auto', padding: 0, border: 'none', background: 'transparent' }}>
            {card ? 'Edit story card' : 'New story card'}
          </div>
          <span className="grow" />
          <div className="row" style={{ gap: 2, padding: 3, borderRadius: 8, background: 'var(--bg-bar)', border: '1px solid var(--border)' }}>
            <button className="btn ghost" style={{ height: 28, border: 'none', background: tab === 'details' ? 'var(--bg-2)' : 'transparent' }} onClick={() => setTab('details')}>
              Details
            </button>
            <button className="btn ghost" style={{ height: 28, border: 'none', background: tab === 'settings' ? 'var(--bg-2)' : 'transparent' }} onClick={() => setTab('settings')}>
              Generator settings
            </button>
          </div>
          <button className="btn icon" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32 }}>
            <IconClose />
          </button>
        </header>
        <div className="body">
          {tab === 'details' ? (
            <>
              <div className="row" style={{ gap: 10 }}>
                <label className="col" style={{ width: 160 }}>
                  <span className="label">Type</span>
                  <select className="field" value={TYPES.includes(type) ? type : 'Custom'} onChange={(e) => setType(e.target.value)}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                {type === 'Custom' && (
                  <label className="col grow">
                    <span className="label">Custom type</span>
                    <input className="field" value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Item, Event, Spell…" />
                  </label>
                )}
              </div>
              <label className="col">
                <span className="row">
                  <span className="label">Name</span>
                  <span className="small muted">for you only — the AI never sees it</span>
                  <span className="grow" />
                  <button className="btn" style={{ height: 28, fontSize: 12 }} disabled={busy !== null} onClick={() => generate('name')}>
                    {busy === 'name' ? 'Generating…' : 'Generate new'}
                  </button>
                </span>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Merav" />
              </label>
              <label className="col">
                <span className="row">
                  <span className="label">Entry</span>
                  <span className="small muted">what the AI sees when triggered — mention the name</span>
                  <span className="grow" />
                  <button className="btn" style={{ height: 28, fontSize: 12 }} disabled={busy !== null} onClick={() => generate('entry')}>
                    {busy === 'entry' ? 'Generating…' : 'Generate new'}
                  </button>
                </span>
                <textarea className="field" style={{ minHeight: 120 }} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Merav leads the caravan. She is blind at night and hides it." />
              </label>
              <label className="col">
                <span className="row">
                  <span className="label">Triggers</span>
                  <span className="small muted">comma-separated, case-insensitive, spaces matter</span>
                </span>
                <input className="field mono" value={triggers} onChange={(e) => setTriggers(e.target.value)} placeholder="merav,lead rider" />
              </label>
              <label className="col">
                <span className="label">Notes (never sent to the AI)</span>
                <textarea className="field" style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              {error && (
                <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>
                  {error}
                </p>
              )}
            </>
          ) : (
            <GeneratorSettings settings={settings} onChange={onSettings} />
          )}
        </div>
        <footer style={{ display: 'flex', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          {card && (
            <button className="btn ghost danger" onClick={() => onSave({ ...build(), entry: '' }, 'close')} title="Remove this card">
              Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {settings.speedCreate && !card ? (
            <button className="btn primary" disabled={!canSave} onClick={() => onSave(build(), 'new')}>
              Next
            </button>
          ) : (
            <button className="btn primary" disabled={!canSave} onClick={() => onSave(build(), 'close')}>
              Finish
            </button>
          )}
        </footer>
      </div>
    </>
  );
}

function GeneratorSettings({ settings, onChange }: { settings: CardGeneratorSettings; onChange: (s: CardGeneratorSettings) => void }) {
  const set = (patch: Partial<CardGeneratorSettings>) => onChange({ ...settings, ...patch });
  return (
    <>
      <div className="setting">
        <label>Speed create mode</label>
        <span className="small muted">Finish becomes Next</span>
        <button className="toggle" role="switch" aria-checked={settings.speedCreate} onClick={() => set({ speedCreate: !settings.speedCreate })} />
      </div>
      <div className="setting">
        <label>Include Story Summary</label>
        <button className="toggle" role="switch" aria-checked={settings.includeSummary} onClick={() => set({ includeSummary: !settings.includeSummary })} />
      </div>
      <div className="setting">
        <label>Log generations in Notes</label>
        <button className="toggle" role="switch" aria-checked={settings.logToNotes} onClick={() => set({ logToNotes: !settings.logToNotes })} />
      </div>
      <label className="col">
        <span className="label">AI instructions</span>
        <textarea className="field" value={settings.aiInstructions} onChange={(e) => set({ aiInstructions: e.target.value })} placeholder="Write in a noir style with short, punchy sentences. Focus on morally ambiguous characters." />
      </label>
      <label className="col">
        <span className="label">Story information</span>
        <textarea className="field" style={{ minHeight: 120 }} value={settings.storyInformation} onChange={(e) => set({ storyInformation: e.target.value })} placeholder="Setting, lore, your character and companions, factions, magic or technology…" />
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        These settings are saved with this adventure. Generation runs on your story backend (slot 1) and uses JSON-schema constrained output when the backend supports it.
      </p>
    </>
  );
}
