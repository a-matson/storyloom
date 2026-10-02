import { useCallback, useEffect, useState } from 'react';
import type { Adventure, AppSettings } from '@core/model';
import { applyTheme, DEFAULT_APP_SETTINGS, providerFor, storage } from '@app/services';
import { navigate, useRoute } from './router';
import { LibraryScreen } from './components/LibraryScreen';
import { GameScreen } from './components/GameScreen';
import { SetupScreen } from './components/SetupScreen';

/**
 * Shell: loads settings + storage, then renders the screen for the current
 * hash route (see router.ts). First run with no saved settings redirects to
 * #/setup.
 */
export function App() {
  const route = useRoute();
  const [app, setApp] = useState<AppSettings | null>(null);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [backendLabel, setBackendLabel] = useState('no backend');

  useEffect(() => {
    void (async () => {
      await storage.init();
      const saved = await storage.getSettings();
      const settings = saved ?? DEFAULT_APP_SETTINGS;
      setApp(settings);
      applyTheme(settings);
      if (!saved && route.name !== 'setup') navigate({ name: 'setup' }, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const probe = useCallback(async (settings: AppSettings) => {
    try {
      const p = providerFor(settings, settings.defaultProviderId);
      const h = await p.health();
      setBackendOk(h.ok);
      setBackendLabel(h.ok ? (h.modelId ?? settings.providers[0]?.name ?? 'backend') : 'backend offline');
    } catch {
      setBackendOk(false);
      setBackendLabel('backend offline');
    }
  }, []);

  useEffect(() => {
    if (app && route.name === 'library') void probe(app);
  }, [route.name, app, probe]);

  // Load the adventure named by the route.
  useEffect(() => {
    if (!app) return;
    if (route.name !== 'adventure') {
      setAdventure(null);
      return;
    }
    let cancelled = false;
    void storage.getAdventure(route.id).then((adv) => {
      if (cancelled) return;
      if (!adv) {
        setLoadError('That adventure no longer exists.');
        navigate({ name: 'library' }, true);
        return;
      }
      if (!adv.settings.providerId || !app.providers.some((p) => p.id === adv.settings.providerId)) {
        adv.settings = { ...app.defaults, ...adv.settings, providerId: app.defaultProviderId };
      }
      setAdventure(adv);
    });
    return () => {
      cancelled = true;
    };
  }, [route, app]);

  const saveSettings = async (next: AppSettings) => {
    setApp(next);
    applyTheme(next);
    await storage.putSettings(next);
    navigate({ name: 'library' });
  };

  if (!app) return <div className="app" />;

  switch (route.name) {
    case 'setup':
      return <SetupScreen app={app} onSave={saveSettings} firstRun />;
    case 'settings':
      return <SetupScreen app={app} onSave={saveSettings} onBack={() => navigate({ name: 'library' })} />;
    case 'adventure':
      if (!adventure) return <div className="app" />;
      return <GameScreen key={adventure.id} adventure={adventure} app={app} backendLabel={backendLabel} onExit={() => navigate({ name: 'library' })} />;
    case 'library':
    default:
      return (
        <LibraryScreen
          app={app}
          backendLabel={backendLabel}
          backendOk={backendOk}
          notice={loadError}
          onDismissNotice={() => setLoadError(null)}
          onOpen={(id) => navigate({ name: 'adventure', id })}
          onSettings={() => navigate({ name: 'settings' })}
        />
      );
  }
}
