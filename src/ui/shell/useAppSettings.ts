import { useEffect, useEffectEvent, useState } from 'react';
import type { AppSettings } from '@core/model';
import { DEFAULT_APP_SETTINGS, storage } from '@app/services';
import { applyTheme } from '@ui/theme';
import { navigate, type Route } from '@ui/router';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loads app settings once; first run (nothing saved) goes to setup. `null` until loaded. */
export function useAppSettings(route: Route, onError: (message: string) => void) {
  const [app, setApp] = useState<AppSettings | null>(null);

  // Reads the route at load time, not as a dependency.
  const onLoaded = useEffectEvent((saved: AppSettings | undefined) => {
    const settings = saved ?? DEFAULT_APP_SETTINGS;
    setApp(settings);
    applyTheme(settings);
    if (!saved && route.name !== 'setup') navigate({ name: 'setup' }, true);
  });

  useEffect(() => {
    const load = async () => {
      await storage.init();
      return storage.getSettings();
    };
    load().then(onLoaded, (e: unknown) => {
      onError(`Storage problem — using default settings. ${message(e)}`);
      onLoaded(undefined);
    });
  }, [onError]);

  /** Store without leaving the screen (saved image presets from the game sidebar). */
  const persist = async (next: AppSettings) => {
    setApp(next);
    applyTheme(next);
    await storage.putSettings(next);
  };
  const save = async (next: AppSettings) => {
    await persist(next);
    navigate({ name: 'library' });
  };
  return [app, save, persist] as const;
}
