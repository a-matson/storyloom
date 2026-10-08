import { useState } from 'react';
import { actionText, utilityProvider, type Adventure, type AppSettings } from '@core/model';
import { tokenizer } from '@app/services';
import { useAdventureTheme } from '@ui/hooks/useCoverAccent';
import { useGameSession } from '@ui/hooks/useGameSession';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { useReadAloud } from '@ui/hooks/useSpeech';
import { Toast } from '@ui/components/ui/toast';
import { Sidebar } from './sidebar/Sidebar';
import { ContextViewer } from './context/ContextViewer';
import { TraceViewer } from './context/TraceViewer';
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
  const [traceAction, setTraceAction] = useState<string | null>(null);
  const adv = state.adventure;
  useGameKeys(showContext, showSidebar, setShowContext, setShowSidebar);

  const coverUrl = useImageBlob(adv.id, adv.coverId) ?? adv.coverUrl;
  useAdventureTheme(app, adv.settings.textStyle, coverUrl);

  const ctx = state.context?.result;
  // Before the first turn there is no built context; estimate from the log.
  const used = ctx?.budget.used ?? tokenizer.count(adv.actions.map((a) => a.versions[a.active] ?? '').join('\n\n'));
  const last = state.actions.at(-1);
  useReadAloud(app.speech, state.busy, last?.type === 'continue' ? actionText(last) : undefined);
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
            total={ctx?.budget.total ?? adv.settings.model.contextLength}
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
            adventureId={adv.id}
            streaming={state.streaming}
            busy={state.busy}
            pendingImages={state.pendingImages}
            api={api}
            speech={app.speech}
            onViewContext={openContext}
            onViewTrace={() => last && setTraceAction(last.id)}
            contextSummary={ctx ? `${ctx.triggeredCards.length} story cards · ${ctx.usedMemories.length} memories used` : undefined}
            contradiction={state.contradiction?.actionId === last?.id ? state.contradiction?.fact : undefined}
            cast={app.speakerAvatars ? adv.entities : undefined}
          />
          <CommandRow
            busy={state.busy}
            canRetry={last?.type === 'continue'}
            canErase={state.actions.length > 1}
            status={turnStatus(state, backendLabel)}
            api={api}
            onSee={api.see}
            retryReady={state.prefetchReady}
          />
        </main>
        <Sidebar adventure={adv} api={api} utilityModel={!!utilityProvider(app)} hidden={!showSidebar} onClose={() => setShowSidebar(false)} />
      </div>
      {showContext && state.context && <ContextViewer {...state.context} adventure={adv} stats={last?.stats} onClose={() => setShowContext(false)} />}
      {traceAction !== null && <TraceViewer adventureId={adv.id} actionId={traceAction} onClose={() => setTraceAction(null)} />}
      {state.error !== null && <Toast message={state.error} error onDismiss={api.clearError} />}
      {state.notice !== null && state.error === null && <Toast message={state.notice} onDismiss={api.clearNotice} />}
    </div>
  );
}
