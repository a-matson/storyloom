import { useEffect, useState } from 'react';
import type { AppSettings } from '@core/model';
import { providerFor } from '@app/services';

interface Status {
  ok: boolean | null;
  label: string;
}

/** Health of the default backend; probed whenever `active` (the library is showing). Never throws. */
export function useBackendStatus(app: AppSettings | null, active: boolean): Status {
  const [status, setStatus] = useState<Status>({ ok: null, label: 'no backend' });
  useEffect(() => {
    if (!app || !active) return undefined;
    let current = true;
    providerFor(app, app.defaultProviderId)
      .health()
      .then(
        (h) => ({ ok: h.ok, label: h.ok ? (h.modelId ?? app.providers[0]?.name ?? 'backend') : 'backend offline' }),
        () => ({ ok: false, label: 'backend offline' }),
      )
      .then(
        (s) => current && setStatus(s),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [app, active]);
  return status;
}
