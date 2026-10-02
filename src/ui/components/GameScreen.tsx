import { useEffect, useState } from 'react';
import type { Adventure, AppSettings } from '@core/model/types';
import { useGame } from '../hooks/useGame';
import { applyTheme, providerFor, tokenizer } from '@app/services';
import { StoryView } from './StoryView';
import { CommandRow } from './CommandRow';
import { Sidebar } from './Sidebar';
import { ContextViewer } from './ContextViewer';
import { IconHome, IconRedo, IconSettings, IconUndo } from './Icons';

interface Props {
  adventure: Adventure;
  app: AppSettings;
  backendLabel: string;
  onExit: () => void;
}

export function GameScreen({ adventure: initial, app, backendLabel, onExit }: Props) {
  const [state, api] = useGame(initial, app);
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth > 1100);
  const [showContext, setShowContext] = useState(false);
  const adv = state.adventure;

  useEffect(() => {
    applyTheme(app, adv.settings.textStyle);
  }, [app, adv.settings.textStyle]);

  useEffect(() => {
    if (!state.notice) return;
    const t = window.setTimeout(api.clearNotice, 4000);
    return () => window.clearTimeout(t);
  }, [state.notice, api]);

  // Escape closes the context drawer, then the sidebar sheet; Ctrl/⌘+. toggles the sidebar.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showContext) setShowContext(false);
        else if (showSidebar && window.innerWidth <= 1100) setShowSidebar(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        setShowSidebar((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showContext, showSidebar]);

  const ctx = state.context?.result;
  const used = ctx?.budget.used ?? tokenizer.count(adv.actions.map((a) => a.versions[a.active] ?? '').join('\n\n'));
  const total = adv.settings.model.contextLength;
  const last = state.log.last;
  const lastStats = last?.stats;
  const hit = lastStats?.promptTokens ? Math.round(((lastStats.cachedTokens ?? 0) / lastStats.promptTokens) * 100) : null;
  const status = state.busy
    ? 'generating…'
    : [
        lastStats?.promptMs !== undefined ? `${((lastStats.promptMs + (lastStats.generationMs ?? 0)) / 1000).toFixed(1)} s` : backendLabel,
        hit !== null ? `${hit}% cached` : '',
        state.warm === 'warm' ? 'next turn warm' : state.warm === 'warming' ? 'warming…' : '',
      ]
        .filter(Boolean)
        .join(' · ');

  const overflow =
    ctx && (adv.settings.context.contextWarning ?? true)
      ? [
          ctx.droppedCards.length ? `${ctx.droppedCards.length} triggered story card(s) did not fit` : '',
          ctx.droppedSections.length ? `dropped: ${ctx.droppedSections.join(', ')}` : '',
          ctx.sections.some((s) => s.trimmed && s.kind !== 'history' && s.kind !== 'storyCards') ? 'a plot component was trimmed' : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  const openContext = () => {
    if (!state.context) void api.previewContext();
    setShowContext(true);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn icon" aria-label="Back to library" onClick={onExit}>
          <IconHome />
        </button>
        <div className="col" style={{ gap: 1, minWidth: 0 }}>
          <div className="title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {adv.title || 'Untitled adventure'}
          </div>
          <div className="subtitle">{adv.actions.length} actions</div>
        </div>
        <span className="grow" />
        <div className="row" style={{ gap: 6 }}>
          <button className="btn icon" aria-label="Undo" onClick={api.undo} disabled={state.busy || !state.log.canUndo}>
            <IconUndo />
          </button>
          <button className="btn icon" aria-label="Redo" onClick={api.redo} disabled={state.busy || !state.log.canRedo}>
            <IconRedo />
          </button>
        </div>
        <div className="row card raised" style={{ padding: '6px 12px', gap: 10 }}>
          <span className={`dot ${state.error ? 'bad' : 'ok'}`} />
          <span className="small" style={{ fontWeight: 500 }}>
            {adv.settings.modelId ?? backendLabel}
          </span>
        </div>
        <div className="col" style={{ gap: 4, width: 150 }}>
          <div className="row small muted" style={{ justifyContent: 'space-between' }}>
            <span>
              Context
              {overflow && (
                <button
                  className="btn ghost"
                  onClick={openContext}
                  title={overflow}
                  aria-label={`Context warning: ${overflow}`}
                  style={{ height: 18, padding: '0 4px', marginLeft: 4, border: 'none', color: 'var(--danger)', fontSize: 12 }}
                >
                  ⚠
                </button>
              )}
            </span>
            <span className="mono">
              {(used / 1000).toFixed(1)}k / {(total / 1000).toFixed(0)}k
            </span>
          </div>
          <div className="meter">
            {ctx ? (
              ctx.sections.map((s) => <span key={s.kind} style={{ width: `${(s.tokens / total) * 100}%`, background: sectionColor(s.kind) }} />)
            ) : (
              <span style={{ width: `${Math.min(100, (used / total) * 100)}%`, background: 'var(--neutral)' }} />
            )}
          </div>
        </div>
        <button className="btn icon" aria-label="Adventure settings" aria-expanded={showSidebar} onClick={() => setShowSidebar((s) => !s)}>
          <IconSettings />
        </button>
      </header>
      <div className="game">
        <main>
          <StoryView
            actions={state.log.actions}
            streaming={state.streaming}
            busy={state.busy}
            api={api}
            onViewContext={openContext}
            contextSummary={ctx ? `${ctx.triggeredCards.length} story cards · ${ctx.usedMemories.length} memories used` : undefined}
          />
          <CommandRow
            busy={state.busy}
            canRetry={last?.type === 'continue'}
            canErase={state.log.length > 1}
            status={status}
            api={api}
            onSee={() => api.clearNotice()}
            retryReady={state.prefetchReady}
          />
        </main>
        <Sidebar adventure={adv} api={api} provider={providerFor(app, adv.settings.providerId)} hidden={!showSidebar} onClose={() => setShowSidebar(false)} />
      </div>
      {showContext && state.context && (
        <ContextViewer result={state.context.result} prompt={state.context.prompt} stats={lastStats} onClose={() => setShowContext(false)} />
      )}
      {state.error && (
        <div className="toast error" role="alert">
          {state.error}{' '}
          <button className="btn ghost" style={{ height: 24, marginLeft: 8 }} onClick={api.clearError}>
            dismiss
          </button>
        </div>
      )}
      {state.notice && !state.error && (
        <div className="toast" role="status">
          {state.notice}
        </div>
      )}
    </div>
  );
}

function sectionColor(kind: string): string {
  switch (kind) {
    case 'instructions':
      return 'var(--lantern)';
    case 'plotEssentials':
      return 'var(--lantern-soft)';
    case 'storySummary':
      return 'var(--success)';
    case 'storyCards':
      return 'var(--violet)';
    case 'memories':
      return 'var(--verdigris)';
    case 'authorsNote':
      return 'var(--rose)';
    case 'lastAction':
      return 'var(--text)';
    default:
      return 'var(--neutral)';
  }
}
