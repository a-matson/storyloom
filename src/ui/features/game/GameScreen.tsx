import { useEffect, useState } from 'react';
import type { Adventure, AppSettings } from '@core/model';
import { providerFor, tokenizer } from '@app/services';
import { useGameSession } from '@ui/hooks/useGameSession';
import { applyTheme } from '@ui/theme';
import { Toast } from '@ui/components/ui/toast';
import { Sidebar } from '@ui/components/Sidebar';
import { ContextViewer } from '@ui/components/ContextViewer';
import { CommandRow } from './CommandRow';
import { ContextMeter } from './ContextMeter';
import { GameHeader } from './GameHeader';
import { StoryView } from './StoryView';
import { overflowWarning, turnStatus } from './status';
import { sidebarOpenByDefault, useGameKeys } from './useGameKeys';

interface Props {
  adventure: Adventure;
  app: AppSettings;
  backendLabel: string;
  onExit: () => void;
}

export function GameScreen({ adventure: initial, app, backendLabel, onExit }: Props) {
  const [state, api] = useGameSession(initial, app);
  const [showSidebar, setShowSidebar] = useState(sidebarOpenByDefault);
  const [showContext, setShowContext] = useState(false);
  const adv = state.adventure;
  useGameKeys(showContext, showSidebar, setShowContext, setShowSidebar);

  useEffect(() => applyTheme(app, adv.settings.textStyle), [app, adv.settings.textStyle]);
  useEffect(() => {
    const t = state.notice === null ? undefined : window.setTimeout(api.clearNotice, 4000);
    return () => window.clearTimeout(t);
  }, [state.notice, api]);

  const ctx = state.context?.result;
  // Before the first turn there is no built context; estimate from the log.
  const used = ctx?.budget.used ?? tokenizer.count(adv.actions.map((a) => a.versions[a.active] ?? '').join('\n\n'));
  const last = state.actions.at(-1);
  const openContext = () => {
    if (!state.context) void api.previewContext();
    setShowContext(true);
  };

  return (
    <div className="flex h-full flex-col">
      <GameHeader
        title={adv.title}
        actionCount={adv.actions.length}
        busy={state.busy}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        failed={state.error !== null}
        modelLabel={adv.settings.modelId ?? backendLabel}
        meter={
          <ContextMeter
            ctx={ctx}
            used={used}
            total={adv.settings.model.contextLength}
            warning={ctx && (adv.settings.context.contextWarning ?? true) ? overflowWarning(ctx) : ''}
            onOpen={openContext}
          />
        }
        sidebarOpen={showSidebar}
        api={api}
        onExit={onExit}
        onToggleSidebar={() => setShowSidebar((s) => !s)}
      />
      <div className="flex min-h-0 grow">
        <main className="flex min-w-0 grow flex-col">
          <StoryView
            actions={state.actions}
            streaming={state.streaming}
            busy={state.busy}
            api={api}
            onViewContext={openContext}
            contextSummary={ctx ? `${ctx.triggeredCards.length} story cards · ${ctx.usedMemories.length} memories used` : undefined}
          />
          <CommandRow
            busy={state.busy}
            canRetry={last?.type === 'continue'}
            canErase={state.actions.length > 1}
            status={turnStatus(state, backendLabel)}
            api={api}
            onSee={() => api.clearNotice()}
            retryReady={state.prefetchReady}
          />
        </main>
        <Sidebar adventure={adv} api={api} provider={providerFor(app, adv.settings.providerId)} hidden={!showSidebar} onClose={() => setShowSidebar(false)} />
      </div>
      {showContext && state.context && (
        <ContextViewer result={state.context.result} prompt={state.context.prompt} stats={last?.stats} onClose={() => setShowContext(false)} />
      )}
      {state.error !== null && <Toast message={state.error} error onDismiss={api.clearError} />}
      {state.notice !== null && state.error === null && <Toast message={state.notice} />}
    </div>
  );
}
