import { useEffect, useState } from 'react';
import type { Adventure, AppSettings } from '@core/model';
import { storage } from '@app/services';
import { navigate } from '@ui/router';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** An adventure saved before its provider was removed falls back to the default one. */
function withValidProvider(adv: Adventure, app: AppSettings): Adventure {
  const known = adv.settings.providerId !== '' && app.providers.some((p) => p.id === adv.settings.providerId);
  return known ? adv : { ...adv, settings: { ...app.defaults, ...adv.settings, providerId: app.defaultProviderId } };
}

/** Loads the adventure `id` names; a missing or unreadable one goes back to the library with a message. */
export function useRouteAdventure(app: AppSettings | null, id: string | null, onError: (message: string) => void): Adventure | null {
  const [loaded, setLoaded] = useState<Adventure | null>(null);
  useEffect(() => {
    if (!app || id === null) return undefined;
    let current = true;
    const load = async () => {
      const adv = await storage.getAdventure(id);
      if (!current) return;
      if (adv) return setLoaded(withValidProvider(adv, app));
      onError('That adventure no longer exists.');
      navigate({ name: 'library' }, true);
    };
    load().catch((e: unknown) => {
      if (!current) return;
      onError(message(e));
      navigate({ name: 'library' }, true);
    });
    return () => {
      current = false;
    };
  }, [app, id, onError]);
  // Derived, so leaving the route needs no reset.
  return loaded?.id === id ? loaded : null;
}
