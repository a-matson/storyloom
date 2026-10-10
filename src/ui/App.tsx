import { lazy, Suspense, useState } from 'react';
import type { AppSettings } from '@core/model';
import { navigate, useRoute } from './router';
import { useAppSettings } from './shell/useAppSettings';
import { useBackendStatus } from './shell/useBackendStatus';
import { useRouteAdventure } from './shell/useRouteAdventure';
import { LibraryScreen } from './features/library/LibraryScreen';
import { Toast } from './components/ui/toast';

// Only the library is on the start-up path; the other screens load on first visit.
const GameScreen = lazy(async () => ({ default: (await import('./features/game/GameScreen')).GameScreen }));
const ScenarioEditor = lazy(async () => ({ default: (await import('./features/scenario/ScenarioEditor')).ScenarioEditor }));
const SetupScreen = lazy(async () => ({ default: (await import('./features/setup/SetupScreen')).SetupScreen }));

/** Shell: loads settings, then renders the screen for the hash route (see router.ts). */
export function App() {
  const route = useRoute();
  const [loadError, setLoadError] = useState<string | null>(null);
  // Outlives the screen that raised it (a scenario that started with a fallback opening).
  const [warning, setWarning] = useState<string | null>(null);
  const [app, saveSettings, persistSettings] = useAppSettings(route, setLoadError);
  const backend = useBackendStatus(app, route.name === 'library');
  const adventure = useRouteAdventure(app, route.name === 'adventure' ? route.id : null, setLoadError);
  const failed = (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e));
  const onSave = (next: AppSettings) => void saveSettings(next).catch(failed);
  const onAppChange = (next: AppSettings) => void persistSettings(next).catch(failed);

  if (!app) return <div className="h-full" />;

  const screen = (() => {
    switch (route.name) {
      case 'setup':
        return <SetupScreen app={app} onSave={onSave} onChange={onAppChange} firstRun />;
      case 'settings':
        return <SetupScreen app={app} onSave={onSave} onChange={onAppChange} onBack={() => navigate({ name: 'library' })} />;
      case 'adventure':
        if (!adventure) return <div className="h-full" />;
        return (
          <GameScreen
            key={adventure.id}
            adventure={adventure}
            app={app}
            onAppChange={onAppChange}
            backendLabel={backend.label}
            onExit={() => navigate({ name: 'library' })}
          />
        );
      case 'scenario':
        return (
          <ScenarioEditor
            key={route.id}
            id={route.id}
            path={route.path}
            app={app}
            onExit={() => navigate({ name: 'library' })}
            onPath={(path) => navigate({ name: 'scenario', id: route.id, path })}
            onPlay={(advId, w) => {
              setWarning(w ?? null);
              navigate({ name: 'adventure', id: advId });
            }}
          />
        );
      case 'library':
      default:
        return (
          <LibraryScreen
            app={app}
            backendLabel={backend.label}
            backendOk={backend.ok}
            notice={loadError}
            onDismissNotice={() => setLoadError(null)}
            onOpen={(id, w) => {
              setWarning(w ?? null);
              navigate({ name: 'adventure', id });
            }}
            onEditScenario={(id) => navigate({ name: 'scenario', id, path: [] })}
            onSettings={() => navigate({ name: 'settings' })}
          />
        );
    }
  })();
  return (
    <>
      <Suspense fallback={<div className="h-full" />}>{screen}</Suspense>
      {warning !== null && <Toast message={warning} error onDismiss={() => setWarning(null)} />}
    </>
  );
}
