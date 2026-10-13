import { useState } from 'react';
import { sceneNames } from '@core/memory';
import { actionText, type Action, type Adventure, type AppSettings } from '@core/model';
import { outputFlag, type OutputFlag } from '@core/trace';
import { tokenizer } from '@app/services';
import { useAdventureTheme } from '@ui/hooks/useCoverAccent';
import { useGameSession, type GameApi } from '@ui/hooks/useGameSession';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { useReadAloud } from '@ui/hooks/useSpeech';
import { Toast } from '@ui/components/ui/toast';
import { Sidebar } from './sidebar/Sidebar';
import { ContextViewer } from './context/ContextViewer';
import { TraceViewer } from './context/TraceViewer';
import { CommandRow } from './CommandRow';
import { ContextMeter } from './ContextMeter';
import { GameHeader } from './GameHeader';
import { SelectionBar } from './SelectionBar';
import { StoryView } from './StoryView';
import { EntityDrawer } from './entities/EntityDrawer';
import { overflowWarning, turnStatus } from './status';
import { sidebarOpenByDefault, useGameKeys } from './useGameKeys';

interface Props {
  adventure: Adventure;
  app: AppSettings;
  /** Store app settings without leaving the game (saved image presets). */
  onAppChange: (next: AppSettings) => void;
  backendLabel: string;
  onExit: () => void;
}

/** A card opened from a face in the story; the sidebar lists open their own. */
function FaceCard({ id, adventure, api, onOpen }: { id: string; adventure: Adventure; api: GameApi; onOpen: (id: string | null) => void }) {
  const e = adventure.entities.find((x) => x.id === id);
  return e ? <EntityDrawer key={e.id} entity={e} adventure={adventure} api={api} onClose={() => onOpen(null)} onOpen={onOpen} /> : null;
}

/** An error wins over a notice. */
function Notices({ error, notice, api }: { error: string | null; notice: string | null; api: GameApi }) {
  if (error !== null) return <Toast message={error} error onDismiss={api.clearError} />;
  return notice !== null && <Toast message={notice} onDismiss={api.clearNotice} />;
}

/** The contradiction check's verdict wins; otherwise the cheap checks on the last output's text. */
function lastFlag(contradiction: { actionId: string; fact: string } | null, last: Action | undefined, banned: readonly string[]): OutputFlag | undefined {
  if (contradiction && contradiction.actionId === last?.id)
    return { label: `May contradict: ${contradiction.fact}`, button: 'Retry with note', note: contradiction.fact };
  return last?.type === 'continue' ? outputFlag(actionText(last), banned) : undefined;
}

export function GameScreen({ adventure: initial, app, onAppChange, backendLabel, onExit }: Props) {
  const [state, api] = useGameSession(initial, app);
  const [showSidebar, setShowSidebar] = useState(sidebarOpenByDefault);
  const [showContext, setShowContext] = useState(false);
  const [traceAction, setTraceAction] = useState<string | null>(null);
  const [faceId, setFaceId] = useState<string | null>(null);
  const adv = state.adventure;
  useGameKeys(showContext, showSidebar, setShowContext, setShowSidebar);
  useAdventureTheme(app, adv.settings.textStyle, useImageBlob(adv.id, adv.coverId) ?? adv.coverUrl);

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
            retrying={state.retrying}
            pendingImages={state.pendingImages}
            api={api}
            speech={app.speech}
            onViewContext={openContext}
            onViewTrace={() => last && setTraceAction(last.id)}
            contextSummary={ctx ? `${ctx.triggeredCards.length} story cards · ${ctx.usedMemories.length} memories used` : undefined}
            flag={lastFlag(state.contradiction, last, adv.settings.bannedPhrases)}
            cast={app.speakerAvatars ? adv.entities : undefined}
            present={adv.plot.scene && sceneNames(adv.plot.scene, adv.entities).present}
            onOpenEntity={setFaceId}
          />
          {!state.busy && <SelectionBar api={api} entities={adv.entities} />}
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
        <Sidebar adventure={adv} api={api} app={app} onAppChange={onAppChange} hidden={!showSidebar} onClose={() => setShowSidebar(false)} />
      </div>
      {showContext && state.context && <ContextViewer {...state.context} adventure={adv} stats={last?.stats} api={api} onClose={() => setShowContext(false)} />}
      {faceId !== null && <FaceCard id={faceId} adventure={adv} api={api} onOpen={setFaceId} />}
      {traceAction !== null && <TraceViewer adventureId={adv.id} actionId={traceAction} onClose={() => setTraceAction(null)} />}
      <Notices error={state.error} notice={state.notice} api={api} />
    </div>
  );
}
