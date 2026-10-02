import { useEffect, useState } from 'react';
import type { AppSettings } from '@core/model/types';
import { createBlankAdventure, QUICK_STARTS } from '@core/model/scenario';
import type { AdventureSummary } from '@core/ports/storage';
import { storage } from '@app/services';
import { importAdventureFromFile, pickFile } from '../transferUi';
import { IconBook, IconSettings } from './Icons';

interface Props {
  app: AppSettings;
  backendLabel: string;
  backendOk: boolean | null;
  notice?: string | null;
  onDismissNotice?: () => void;
  onOpen: (id: string) => void;
  onSettings: () => void;
}

/** Home: continue the last adventure, quick starts, the adventure grid, import. Scenarios arrive in milestone 5. */
export function LibraryScreen({ app, backendLabel, backendOk, notice, onDismissNotice, onOpen, onSettings }: Props) {
  const [adventures, setAdventures] = useState<AdventureSummary[]>([]);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => void storage.listAdventures().then(setAdventures);
  useEffect(refresh, []);

  const start = async (title: string, opening: string) => {
    const adv = createBlankAdventure(title, opening, app.defaults);
    await storage.putAdventure(adv);
    onOpen(adv.id);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this adventure? This cannot be undone.')) return;
    await storage.deleteAdventure(id);
    refresh();
  };

  const importFile = async () => {
    const file = await pickFile('.json,.zip,application/json,application/zip');
    if (!file) return;
    try {
      const adv = await importAdventureFromFile(file, app.defaults);
      await storage.putAdventure(adv);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const latest = adventures[0];
  return (
    <div className="app">
      <header className="topbar" style={{ height: 60, padding: '0 32px' }}>
        <div className="row" style={{ gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--lantern)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--lantern-ink)',
            }}
          >
            <IconBook width={16} height={16} />
          </span>
          <span className="title" style={{ fontWeight: 600 }}>
            Storyloom
          </span>
        </div>
        <span className="grow" />
        <button className="btn" onClick={onSettings}>
          <span className={`dot ${backendOk === null ? '' : backendOk ? 'ok' : 'bad'}`} />
          {backendLabel}
          <IconSettings width={14} height={14} />
        </button>
      </header>
      <div className="page">
        <div className="row" style={{ gap: 20, alignItems: 'stretch' }}>
          {latest ? (
            <button
              className="tile"
              style={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 20, padding: 20 }}
              onClick={() => onOpen(latest.id)}
            >
              <div className="cover" style={{ width: 180, height: 120, flexShrink: 0 }} />
              <div className="col" style={{ gap: 6, flexGrow: 1 }}>
                <span className="label" style={{ color: 'var(--lantern)' }}>
                  Continue
                </span>
                <span className="name" style={{ fontSize: 28 }}>
                  {latest.title}
                </span>
                <span className="small muted">
                  {latest.actionCount} actions · {latest.modelId ?? 'local model'} · {timeAgo(latest.updatedAt)}
                </span>
              </div>
              <span className="btn lg primary" style={{ pointerEvents: 'none' }}>
                Resume
              </span>
            </button>
          ) : (
            <div className="card" style={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
              <div className="col">
                <h1 className="h">Start your first adventure</h1>
                <p className="muted" style={{ margin: 0 }}>
                  Pick a quick start on the right, or write your own opening. {backendOk === false && 'Connect a backend in Settings first.'}
                </p>
              </div>
            </div>
          )}
          <div className="card col" style={{ width: 320, flexShrink: 0 }}>
            <span className="label">Quick start</span>
            <div className="grid-2">
              {QUICK_STARTS.map((q) => (
                <button key={q.tag} className="btn" style={{ height: 40 }} onClick={() => start(q.title, q.opening)}>
                  {q.title}
                </button>
              ))}
            </div>
            <button className="btn ghost" style={{ borderStyle: 'dashed', color: 'var(--lantern)' }} onClick={() => setShowCustom((s) => !s)}>
              Write your own opening
            </button>
            {showCustom && (
              <>
                <textarea className="field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="You are…" />
                <button className="btn primary" disabled={!custom.trim()} onClick={() => start('New adventure', custom.trim())}>
                  Begin
                </button>
              </>
            )}
          </div>
        </div>

        <section className="col" style={{ gap: 14 }}>
          <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
            <h2 className="h">My adventures</h2>
            <span className="small muted">{adventures.length}</span>
            <span className="grow" />
            <button className="btn ghost" onClick={importFile} title="Storyloom JSON, or an AI Dungeon adventure export (JSON or zip)">
              Import…
            </button>
          </div>
          {adventures.length === 0 && <p className="muted small">Nothing here yet.</p>}
          <div className="grid-4">
            {adventures.map((a) => (
              <div key={a.id} className="tile" style={{ position: 'relative' }}>
                <button className="cover" style={{ border: 'none', cursor: 'pointer' }} aria-label={`Open ${a.title}`} onClick={() => onOpen(a.id)} />
                <button
                  className="name"
                  style={{ background: 'transparent', border: 'none', textAlign: 'left', padding: 0, color: 'inherit' }}
                  onClick={() => onOpen(a.id)}
                >
                  {a.title}
                </button>
                <div className="row small muted">
                  <span>
                    {a.actionCount} actions · {timeAgo(a.updatedAt)}
                  </span>
                  <span className="grow" />
                  <button className="btn ghost danger" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => remove(a.id)}>
                    delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col" style={{ gap: 14 }}>
          <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
            <h2 className="h">My scenarios</h2>
            <span className="small muted">coming in milestone 5</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Scenarios are reusable templates with placeholders, story cards and scripts.
          </p>
        </section>
      </div>
      {(error || notice) && (
        <div className={`toast ${error ? 'error' : ''}`} role="alert">
          {error ?? notice}
          <button
            className="btn ghost"
            style={{ height: 24, marginLeft: 8 }}
            onClick={() => {
              setError(null);
              onDismissNotice?.();
            }}
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
