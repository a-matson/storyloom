import { useEffect, useState } from 'react';
import type { Accent } from '@ui/lib/dominantColour';

// Outside the hook: the React Compiler cannot lower an import expression inside a component or hook.
const read = (url: string) => import('@ui/lib/dominantColour').then((m) => m.coverAccent(url));

/** The cover's accent colour, or undefined while it loads or when there is no cover. Lazy: the canvas code is only fetched for the Dynamic theme. */
export function useCoverAccent(url: string | undefined): Accent | undefined {
  const [accent, setAccent] = useState<Accent>();
  useEffect(() => {
    if (url === undefined) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await read(url);
        if (!cancelled) setAccent(next);
      } catch (e) {
        console.warn('could not read the cover colour', e);
      }
    };
    void load();
    // Clearing on cleanup, not on a missing url: a setState in the effect body cascades a render.
    return () => {
      cancelled = true;
      setAccent(undefined);
    };
  }, [url]);
  return accent;
}
