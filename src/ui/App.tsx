import { useCallback, useEffect, useState } from 'react';
import type { Adventure, AppSettings } from '@core/types';
import { applyTheme, DEFAULT_APP_SETTINGS, providerFor, storage } from './services';
import { LibraryScreen } from './components/LibraryScreen';
import { GameScreen } from './components/GameScreen';
import { SetupScreen } from './components/SetupScreen';

type Route = { name: 'loading' } | { name: 'setup'; firstRun: boolean } | { name: 'library' } | { name: 'game'; adventure: Adventure };

/**
 * Shell: loads settings + storage, routes between Library, Game and Setup.
 * Routing is in-memory (no URL) for milestone 1; a hash router is a small
 * follow-up once scenarios and the editor exist.
 */
export function App() {
  const [app, setApp] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [route, setRoute] = useState<Route>({ name: 'loading' });
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [backendLabel, setBackendLabel] = useState('no backend');

  useEffect(() => {
    void (async () => {
      await storage.init();
      const saved = await storage.getSettings();
      const settings = saved ?? DEFAULT_APP_SETTINGS;
      setApp(settings);
      applyTheme(settings);
      setRoute(saved ? { name: 'library' } : { name: 'setup', firstRun: true });
    })();
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
    if (route.name === 'library') void probe(app);
  }, [route.name, app, probe]);

  const saveSettings = async (next: AppSettings) => {
    setApp(next);
    applyTheme(next);
    await storage.putSettings(next);
    setRoute({ name: 'library' });
  };

  const open = async (id: string) => {
    const adv = await storage.getAdventure(id);
    if (!adv) return;
    // Adventures created before a backend was configured pick up the current default.
    if (!adv.settings.providerId || !app.providers.some((p) => p.id === adv.settings.providerId)) {
      adv.settings = { ...app.defaults, ...adv.settings, providerId: app.defaultProviderId };
    }
    setRoute({ name: 'game', adventure: adv });
  };

  switch (route.name) {
    case 'loading':
      return <div className="app" />;
    case 'setup':
      return <SetupScreen app={app} onSave={saveSettings} firstRun={route.firstRun} onBack={route.firstRun ? undefined : () => setRoute({ name: 'library' })} />;
    case 'library':
      return <LibraryScreen app={app} backendLabel={backendLabel} backendOk={backendOk} onOpen={open} onSettings={() => setRoute({ name: 'setup', firstRun: false })} />;
    case 'game':
      return <GameScreen key={route.adventure.id} adventure={route.adventure} app={app} backendLabel={backendLabel} onExit={() => setRoute({ name: 'library' })} />;
  }
}
