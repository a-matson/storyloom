import { useEffect, useState } from 'react';
import type { Accent } from '@ui/lib/dominantColour';

/** The cover's accent colour, or undefined while it loads or when there is no cover. Lazy: the canvas code is only fetched for the Dynamic theme. */
export function useCoverAccent(url: string | undefined): Accent | undefined {
  const [accent, setAccent] = useState<Accent>();
  useEffect(() => {
    if (url === undefined) return undefined;
    let cancelled = false;
    const read = async () => {
      const { coverAccent } = await import('@ui/lib/dominantColour');
      const next = await coverAccent(url);
      if (!cancelled) setAccent(next);
    };
    read().catch((e: unknown) => {
      console.warn('could not read the cover colour', e);
    });
    // Clearing on cleanup, not on a missing url: a setState in the effect body cascades a render.
    return () => {
      cancelled = true;
      setAccent(undefined);
    };
  }, [url]);
  return accent;
}
