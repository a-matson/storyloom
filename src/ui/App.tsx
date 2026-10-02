import { lazy, Suspense, useEffect, useEffectEvent, useState } from 'react';
import type { Adventure, AppSettings } from '@core/model';
import { DEFAULT_APP_SETTINGS, providerFor, storage } from '@app/services';
import { applyTheme } from './theme';
import { navigate, useRoute } from './router';
import { LibraryScreen } from './features/library/LibraryScreen';

// Only the library is on the start-up path; the other screens load on first visit.
const GameScreen = lazy(async () => ({ default: (await import('./components/GameScreen')).GameScreen }));
const SetupScreen = lazy(async () => ({ default: (await import('./features/setup/SetupScreen')).SetupScreen }));

/** Status for the library header; never throws. */
async function probeBackend(settings: AppSettings): Promise<{ ok: boolean; label: string }> {
  try {
    const h = await providerFor(settings, settings.defaultProviderId).health();
    return { ok: h.ok, label: h.ok ? (h.modelId ?? settings.providers[0]?.name ?? 'backend') : 'backend offline' };
  } catch {
    return { ok: false, label: 'backend offline' };
  }
}

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

  // First run (no saved settings) goes to setup unless already there; reads the route at that moment.
  const onLoaded = useEffectEvent((saved: AppSettings | undefined) => {
    const settings = saved ?? DEFAULT_APP_SETTINGS;
    setApp(settings);
    applyTheme(settings);
    if (!saved && route.name !== 'setup') navigate({ name: 'setup' }, true);
  });

  useEffect(() => {
    void (async () => {
      let saved: AppSettings | undefined;
      try {
        await storage.init();
        saved = await storage.getSettings();
      } catch (e) {
        setLoadError(`Storage problem — using default settings. ${e instanceof Error ? e.message : String(e)}`);
      }
      onLoaded(saved);
    })();
  }, []);

  useEffect(() => {
    if (!app || route.name !== 'library') return;
    void (async () => {
      const { ok, label } = await probeBackend(app);
      setBackendOk(ok);
      setBackendLabel(label);
    })();
  }, [route.name, app]);

  // Load the adventure named by the route.
  useEffect(() => {
    if (!app) return;
    if (route.name !== 'adventure') {
      setAdventure(null);
      return;
    }
    let cancelled = false;
    void storage
      .getAdventure(route.id)
      .then((adv) => {
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
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        navigate({ name: 'library' }, true);
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

  const screen = (() => {
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
  })();
  return <Suspense fallback={<div className="app" />}>{screen}</Suspense>;
}
