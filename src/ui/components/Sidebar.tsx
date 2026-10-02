import { useState, type ReactNode } from 'react';
import type { Adventure, StoryCard } from '@core/types';
import { MAX_STORY_CARDS } from '@core/storyCards';
import type { Provider } from '@providers/types';
import { CardDialog } from './CardDialog';
import { MODEL_PRESETS } from '@core/modelPresets';
import { exportStoryCardsJson, importStoryCardsJson } from '@storage/transfer';
import { tokenizer } from '../services';
import { downloadAdventureJson, downloadAdventureText, downloadText, pickFile } from '../transferUi';
import type { GameApi } from '../hooks/useGame';
import { IconChevron } from './Icons';

interface Props {
  adventure: Adventure;
  api: GameApi;
  provider: Provider;
  hidden: boolean;
  onClose: () => void;
}

type Tab = 'adventure' | 'gameplay';
type SubTab = 'plot' | 'cards' | 'details';

/** Adventure / Gameplay settings panel. Mirrors the in-game settings of AI Dungeon. */
export function Sidebar({ adventure, api, provider, hidden, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('adventure');
  const [sub, setSub] = useState<SubTab>('plot');
  return (
    <aside className="sidebar" hidden={hidden} aria-label="Adventure settings">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'adventure'} onClick={() => setTab('adventure')}>
          Adventure
        </button>
        <button role="tab" aria-selected={tab === 'gameplay'} onClick={() => setTab('gameplay')}>
          Gameplay
        </button>
        <span className="grow" />
        <button className="btn ghost icon" aria-label="Close settings" onClick={onClose} style={{ height: 32, width: 32 }}>
          ×
        </button>
      </div>
      {tab === 'adventure' ? (
        <>
          <div className="subtabs">
            <button className="chip" aria-pressed={sub === 'plot'} onClick={() => setSub('plot')}>
              Plot
            </button>
            <button className="chip" aria-pressed={sub === 'cards'} onClick={() => setSub('cards')}>
              Story cards · {adventure.storyCards.length}
            </button>
            <button className="chip" aria-pressed={sub === 'details'} onClick={() => setSub('details')}>
              Details
            </button>
          </div>
          <div className="body">
            {sub === 'plot' && <PlotTab adventure={adventure} api={api} />}
            {sub === 'cards' && <CardsTab adventure={adventure} api={api} provider={provider} />}
            {sub === 'details' && <DetailsTab adventure={adventure} api={api} />}
          </div>
        </>
      ) : (
        <div className="body" style={{ paddingTop: 12 }}>
          <GameplayTab adventure={adventure} api={api} />
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  tokens,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  tokens?: number;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header onClick={() => setOpen((o) => !o)}>
        <IconChevron open={open} />
        <span className="grow">{title}</span>
        {badge}
        {tokens !== undefined && <span className="mono muted">{tokens} tok</span>}
      </header>
      {open && <div className="content">{children}</div>}
    </section>
  );
}

function PlotTab({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const p = adventure.plot;
  const field = (key: 'aiInstructions' | 'storySummary' | 'plotEssentials' | 'authorsNote', placeholder: string) => (
    <textarea className="field" value={p[key] ?? ''} placeholder={placeholder} onChange={(e) => api.updatePlot({ [key]: e.target.value })} />
  );
  return (
    <>
      <Section title="AI Instructions" tokens={tokenizer.count(p.aiInstructions ?? '')} defaultOpen>
        {field('aiInstructions', 'System prompt: how the AI should write.')}
      </Section>
      <Section
        title="Story Summary"
        tokens={tokenizer.count(p.storySummary ?? '')}
        badge={adventure.settings.memory.autoSummary ? <span className="pill auto">auto</span> : undefined}
      >
        {field('storySummary', 'Maintained automatically every 15 actions; edit freely.')}
      </Section>
      <Section title="Plot Essentials" tokens={tokenizer.count(p.plotEssentials ?? '')}>
        {field('plotEssentials', 'Key facts the AI must always remember.')}
      </Section>
      <Section title="Author's Note" tokens={tokenizer.count(p.authorsNote ?? '')}>
        {field('authorsNote', 'Short guidance on style, tone and pacing.')}
      </Section>
      <section className="section">
        <header>
          <span className="grow">Third person</span>
          <input
            className="field"
            style={{ width: 120, height: 28, fontSize: 12 }}
            placeholder="Name"
            value={p.thirdPerson?.name ?? ''}
            onChange={(e) => api.updatePlot({ thirdPerson: { enabled: p.thirdPerson?.enabled ?? false, name: e.target.value } })}
          />
          <button
            className="toggle"
            role="switch"
            aria-checked={!!p.thirdPerson?.enabled}
            aria-label="Third person"
            onClick={() => api.updatePlot({ thirdPerson: { enabled: !p.thirdPerson?.enabled, name: p.thirdPerson?.name ?? '' } })}
          />
        </header>
      </section>
      <MemoryStatus adventure={adventure} />
    </>
  );
}

function MemoryStatus({ adventure }: { adventure: Adventure }) {
  const m = adventure.settings.memory;
  const count = adventure.actions.length;
  const nextMemoryIn = Math.max(0, 6 - ((count - 12) % 6 || 0));
  return (
    <section className="card" style={{ background: 'var(--bg-bar)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row">
        <span className="label">Memory</span>
        <span className="grow" />
        <span className="mono muted">
          bank {adventure.memories.length} / {m.bankSize}
        </span>
      </div>
      <div className="meter">
        <span style={{ width: `${Math.min(100, (adventure.memories.length / Math.max(1, m.bankSize)) * 100)}%`, background: 'var(--verdigris)' }} />
      </div>
      <div className="row small" style={{ color: 'var(--text-prose)', justifyContent: 'space-between' }}>
        <span>{m.autoSummary ? 'Auto summary on' : 'Auto summary off'}</span>
        <span>{count >= 12 ? `next memory in ${nextMemoryIn || 6} actions` : `first memory at 12 actions`}</span>
      </div>
    </section>
  );
}

function CardsTab({ adventure, api, provider }: { adventure: Adventure; api: GameApi; provider: Provider }) {
  const cards = adventure.storyCards;
  const [editing, setEditing] = useState<StoryCard | 'new' | null>(null);
  // Bumped on every open so the dialog remounts with fresh state (speed-create "Next").
  const [dialogKey, setDialogKey] = useState(0);
  const [filter, setFilter] = useState('');
  const shown = filter.trim()
    ? cards.filter((c) => `${c.name} ${c.type} ${c.triggers.join(' ')} ${c.entry}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : cards;
  const save = (card: StoryCard, next?: 'close' | 'new') => {
    if (!card.entry) {
      api.setStoryCards(cards.filter((c) => c.id !== card.id)); // Delete from the dialog
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
      <div className="row">
        <input className="field" style={{ height: 32, fontSize: 12 }} placeholder="Filter cards" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn primary" style={{ height: 32 }} onClick={() => setEditing('new')} disabled={cards.length >= MAX_STORY_CARDS}>
          + New
        </button>
      </div>
      {cards.length === 0 && (
        <p className="muted small">No story cards yet. Cards are sent to the AI only when one of their triggers appears in recent actions.</p>
      )}
      {shown.map((c) => (
        <button key={c.id} className="section" style={{ textAlign: 'left', padding: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => setEditing(c)}>
          <header style={{ cursor: 'pointer' }}>
            <span className={`pill ${c.type.toLowerCase() === 'character' ? 'do' : c.type.toLowerCase() === 'location' ? 'say' : ''}`}>{c.type}</span>
            <span className="grow" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.name || '(unnamed)'}
            </span>
            <span className="mono muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
              {c.triggers.join(',')}
            </span>
            <span className="mono muted">{tokenizer.count(c.entry)}</span>
          </header>
        </button>
      ))}
      {editing && (
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

function DetailsTab({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const importCards = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const cards = importStoryCardsJson(await file.text());
      api.setStoryCards([...adventure.storyCards, ...cards]);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <label className="col">
        <span className="label">Title</span>
        <input className="field" value={adventure.title} onChange={(e) => api.updateMeta({ title: e.target.value })} />
      </label>
      <label className="col">
        <span className="label">Description</span>
        <textarea className="field" value={adventure.description} onChange={(e) => api.updateMeta({ description: e.target.value })} />
      </label>
      <label className="col">
        <span className="label">Tags</span>
        <input
          className="field"
          value={adventure.tags.join(', ')}
          onChange={(e) =>
            api.updateMeta({
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <section className="section">
        <header style={{ cursor: 'default' }}>
          <span className="grow">Story cards</span>
        </header>
        <div className="content">
          <div className="row">
            <button className="btn" onClick={() => downloadText(`${adventure.title || 'cards'}.cards.json`, exportStoryCardsJson(adventure.storyCards))}>
              Export cards
            </button>
            <button className="btn" onClick={importCards}>
              Import cards
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            JSON array of {'{'}keys, entry, type, title{'}'} — the same shape AI Dungeon exports.
          </p>
        </div>
      </section>
      <section className="section">
        <header style={{ cursor: 'default' }}>
          <span className="grow">Download adventure</span>
        </header>
        <div className="content">
          <div className="row">
            <button className="btn" onClick={() => downloadAdventureJson(adventure)}>
              JSON (full backup)
            </button>
            <button className="btn" onClick={() => downloadAdventureText(adventure)}>
              Plain text
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            The JSON backup restores everything, including retries and settings; import it from the Library.
          </p>
        </div>
      </section>
    </>
  );
}

function GameplayTab({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const s = adventure.settings;
  const setModel = (patch: Partial<typeof s.model>) => api.updateSettings({ model: { ...s.model, ...patch } });
  const setMemory = (patch: Partial<typeof s.memory>) => api.updateSettings({ memory: { ...s.memory, ...patch } });
  const setContext = (patch: Partial<typeof s.context>) => api.updateSettings({ context: { ...s.context, ...patch } });
  const num = (label: string, key: keyof typeof s.model, step = 0.05, min = 0, max?: number) => (
    <div className="setting">
      <label htmlFor={`m-${key}`}>{label}</label>
      <input
        id={`m-${key}`}
        type="number"
        step={step}
        min={min}
        max={max}
        value={s.model[key] ?? ''}
        onChange={(e) => setModel({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
      />
    </div>
  );
  return (
    <>
      <Section title="Story generator" defaultOpen>
        <div className="setting">
          <label htmlFor="tpl">Prompt template</label>
          <select
            id="tpl"
            className="field"
            style={{ width: 140, height: 32 }}
            value={s.template}
            onChange={(e) => api.updateSettings({ template: e.target.value as typeof s.template })}
          >
            <option value="chatml">ChatML</option>
            <option value="llama3">Llama 3</option>
            <option value="mistral">Mistral</option>
            <option value="gemma">Gemma</option>
            <option value="raw">Raw</option>
          </select>
        </div>
        <div className="setting">
          <label htmlFor="preset">Apply preset</label>
          <select
            id="preset"
            className="field"
            style={{ width: 180, height: 32 }}
            defaultValue=""
            onChange={(e) => {
              const p = MODEL_PRESETS.find((x) => x.id === e.target.value);
              if (p) api.updateSettings({ template: p.template, model: { ...s.model, ...p.settings } });
            }}
          >
            <option value="">Choose…</option>
            {MODEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="small muted">Model: {s.modelId ?? 'as loaded in the backend'}. Change backends in Settings.</p>
      </Section>
      <Section title="Memory system" defaultOpen>
        <div className="setting">
          <label htmlFor="ctx">Context length</label>
          <input
            id="ctx"
            type="range"
            min={1024}
            max={131072}
            step={1024}
            value={s.model.contextLength}
            onChange={(e) => setModel({ contextLength: Number(e.target.value) })}
          />
          <span className="mono">{(s.model.contextLength / 1024).toFixed(0)}k</span>
        </div>
        <div className="setting">
          <label>Auto summarization</label>
          <button className="toggle" role="switch" aria-checked={s.memory.autoSummary} onClick={() => setMemory({ autoSummary: !s.memory.autoSummary })} />
        </div>
        <div className="setting">
          <label>Memory bank</label>
          <button className="toggle" role="switch" aria-checked={s.memory.memoryBank} onClick={() => setMemory({ memoryBank: !s.memory.memoryBank })} />
        </div>
        <div className="setting">
          <label htmlFor="bank">Bank size</label>
          <input
            id="bank"
            type="number"
            min={10}
            max={2000}
            step={10}
            value={s.memory.bankSize}
            onChange={(e) => setMemory({ bankSize: Number(e.target.value) })}
          />
        </div>
        <div className="setting">
          <label title="History before cards/memories so the backend reuses its KV cache">Cache-stable layout</label>
          <button
            className="toggle"
            role="switch"
            aria-checked={s.context.cacheStableLayout}
            onClick={() => setContext({ cacheStableLayout: !s.context.cacheStableLayout })}
          />
        </div>
        <div className="setting">
          <label title="After each turn, prefill the next turn's stable prefix so the first token arrives faster">Warm cache between turns</label>
          <button
            className="toggle"
            role="switch"
            aria-checked={s.context.cacheWarming ?? true}
            onClick={() => setContext({ cacheWarming: !(s.context.cacheWarming ?? true) })}
          />
        </div>
        <div className="setting">
          <label title="Generate one retry alternative in the background on a second slot (needs -np 2 and spare VRAM)">Prefetch a retry</label>
          <button
            className="toggle"
            role="switch"
            aria-checked={s.context.retryPrefetch ?? false}
            onClick={() => setContext({ retryPrefetch: !(s.context.retryPrefetch ?? false) })}
          />
        </div>
      </Section>
      <Section title="Model settings">
        {num('Response length', 'responseLength', 10, 16, 2048)}
        {num('Temperature', 'temperature', 0.05, 0, 3)}
        {num('Top K', 'topK', 10, 0)}
        {num('Top P', 'topP', 0.01, 0, 1)}
        {num('Min P', 'minP', 0.01, 0, 1)}
        {num('Presence penalty', 'presencePenalty', 0.05, -2, 2)}
        {num('Frequency penalty', 'frequencyPenalty', 0.05, -2, 2)}
        {num('Repetition penalty', 'repetitionPenalty', 0.01, 0.5, 2)}
        {num('Seed (blank = random)', 'seed', 1, 0)}
      </Section>
      <Section title="Testing & feedback">
        <div className="setting">
          <label>Raw model output</label>
          <button className="toggle" role="switch" aria-checked={s.context.rawOutput} onClick={() => setContext({ rawOutput: !s.context.rawOutput })} />
        </div>
        <div className="setting">
          <label title="Red ⚠ on the context meter when story cards or plot components did not fit">Context warning</label>
          <button
            className="toggle"
            role="switch"
            aria-checked={s.context.contextWarning ?? true}
            onClick={() => setContext({ contextWarning: !(s.context.contextWarning ?? true) })}
          />
        </div>
      </Section>
      <Section title="Appearance">
        <div className="setting">
          <label htmlFor="ts">Text style</label>
          <select
            id="ts"
            className="field"
            style={{ width: 140, height: 32 }}
            value={s.textStyle}
            onChange={(e) => api.updateSettings({ textStyle: e.target.value as typeof s.textStyle })}
          >
            <option value="print">Print</option>
            <option value="clean">Clean</option>
            <option value="hacker">Hacker</option>
          </select>
        </div>
      </Section>
    </>
  );
}
