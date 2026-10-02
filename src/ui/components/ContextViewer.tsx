import { useState } from 'react';
import type { ContextBuildResult, SectionKind } from '@core/contextBuilder';
import type { CompletionStats } from '@providers/types';
import { IconClose } from './Icons';

const COLORS: Record<SectionKind, string> = {
  instructions: 'var(--lantern)',
  plotEssentials: 'var(--lantern-soft)',
  storySummary: 'var(--success)',
  history: 'var(--neutral)',
  storyCards: 'var(--violet)',
  memories: 'var(--verdigris)',
  authorsNote: 'var(--rose)',
  lastAction: 'var(--text)',
  frontMemory: 'var(--text-muted)',
};
const LABELS: Record<SectionKind, string> = {
  instructions: 'AI Instructions',
  plotEssentials: 'Plot Essentials',
  storySummary: 'Story Summary',
  history: 'History',
  storyCards: 'Story cards',
  memories: 'Memories',
  authorsNote: "Author's Note",
  lastAction: 'Last action',
  frontMemory: 'Front memory (script)',
};

interface Props {
  result: ContextBuildResult;
  prompt: string;
  /** Backend statistics for the last generation, when available. */
  stats?: CompletionStats;
  onClose: () => void;
}

/** What was sent to the model: budget bar, per-section tokens, cards, memories, raw prompt. */
export function ContextViewer({ result, prompt, stats, onClose }: Props) {
  const [tab, setTab] = useState<'budget' | 'raw'>('budget');
  const total = result.budget.total || 1;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="Context sent to the model">
        <header>
          <div className="col" style={{ gap: 2 }}>
            <div className="topbar title" style={{ height: 'auto', padding: 0, border: 'none', background: 'transparent' }}>
              Context sent to the model
            </div>
            <div className="small muted">
              <span className="mono">
                {result.budget.used.toLocaleString()} / {result.budget.total.toLocaleString()} tokens
              </span>{' '}
              · estimates calibrated against the backend
            </div>
          </div>
          <span className="grow" />
          <div className="row" style={{ gap: 2, padding: 3, borderRadius: 8, background: 'var(--bg-bar)', border: '1px solid var(--border)' }}>
            <button
              className="btn ghost"
              style={{ height: 28, border: 'none', background: tab === 'budget' ? 'var(--bg-2)' : 'transparent' }}
              onClick={() => setTab('budget')}
            >
              Budget
            </button>
            <button
              className="btn ghost"
              style={{ height: 28, border: 'none', background: tab === 'raw' ? 'var(--bg-2)' : 'transparent' }}
              onClick={() => setTab('raw')}
            >
              Raw prompt
            </button>
          </div>
          <button className="btn icon" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32 }}>
            <IconClose />
          </button>
        </header>
        <div className="body">
          {tab === 'budget' ? (
            <>
              <div className="meter" style={{ height: 18, borderRadius: 5 }}>
                {result.sections.map((s) => (
                  <span key={s.kind} style={{ width: `${(s.tokens / total) * 100}%`, background: COLORS[s.kind] }} title={`${LABELS[s.kind]} ${s.tokens}`} />
                ))}
              </div>
              <div className="col" style={{ gap: 6 }}>
                {result.sections.map((s) => (
                  <div
                    key={s.kind}
                    className="row"
                    style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-bar)', border: '1px solid var(--border)' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[s.kind] }} />
                    <span style={{ fontWeight: 500, flexGrow: 1 }}>
                      {LABELS[s.kind]}
                      {s.kind === 'history' && result.historyRange && (
                        <span className="muted">
                          {' '}
                          · actions {result.historyRange.from + 1}–{result.historyRange.to}
                        </span>
                      )}
                      {s.kind === 'storyCards' && <span className="muted"> · {result.triggeredCards.length} triggered</span>}
                      {s.kind === 'memories' && <span className="muted"> · {result.usedMemories.length} retrieved</span>}
                    </span>
                    {s.cacheable && <span className="pill auto">cached prefix</span>}
                    {s.trimmed && <span className="pill">trimmed</span>}
                    <span className="mono" style={{ width: 64, textAlign: 'right', color: 'var(--text-prose)' }}>
                      {s.tokens.toLocaleString()}
                    </span>
                  </div>
                ))}
                <div className="row" style={{ padding: '8px 12px' }}>
                  <span className="muted">Free</span>
                  <span className="grow" />
                  <span className="mono muted">{result.budget.free.toLocaleString()}</span>
                </div>
              </div>
              {result.triggeredCards.length > 0 && (
                <div className="col" style={{ gap: 4 }}>
                  <span className="label">Triggered cards</span>
                  {result.triggeredCards.map((m) => (
                    <div key={m.card.id} className="row small" style={{ color: 'var(--text-prose)' }}>
                      <span style={{ fontWeight: 500 }}>{m.card.name}</span>
                      <span className="muted">
                        hit “{m.triggers.join('”, “')}” {m.lastHitDistance === 0 ? 'in the last action' : `${m.lastHitDistance} actions ago`} · frequency{' '}
                        {m.hits}
                      </span>
                    </div>
                  ))}
                  {result.droppedCards.map((m) => (
                    <div key={m.card.id} className="row small muted">
                      <span>{m.card.name}</span>
                      <span>did not fit</span>
                    </div>
                  ))}
                </div>
              )}
              {result.usedMemories.length > 0 && (
                <div className="col" style={{ gap: 4 }}>
                  <span className="label">Memories used</span>
                  {result.usedMemories.map((m) => (
                    <div key={m.id} className="small" style={{ color: 'var(--text-prose)' }}>
                      <span className="mono muted">
                        actions {m.fromAction + 1}–{m.toAction}
                      </span>{' '}
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
              {result.warnings.length > 0 && (
                <div className="col" style={{ gap: 4 }}>
                  <span className="label">Warnings</span>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="small" style={{ color: 'var(--warning)' }}>
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-prose)' }}>
              {prompt}
            </pre>
          )}
        </div>
        {stats && (
          <footer className="row mono muted" style={{ gap: 14, padding: '10px 24px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
            {stats.promptTokens !== undefined && (
              <span>
                prompt eval {stats.promptTokens.toLocaleString()} tok{stats.promptMs !== undefined ? ` · ${(stats.promptMs / 1000).toFixed(2)} s` : ''}
              </span>
            )}
            {stats.generatedTokens !== undefined && (
              <span>
                generation {stats.generatedTokens} tok{stats.generationMs !== undefined ? ` · ${(stats.generationMs / 1000).toFixed(1)} s` : ''}
              </span>
            )}
            {stats.promptTokens ? <span>cache hit {Math.round(((stats.cachedTokens ?? 0) / stats.promptTokens) * 100)}%</span> : null}
            {stats.generatedTokens && stats.generationMs ? <span>{(stats.generatedTokens / (stats.generationMs / 1000)).toFixed(1)} tok/s</span> : null}
          </footer>
        )}
      </div>
    </>
  );
}
