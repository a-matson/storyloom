import { useEffect, useState } from 'react';
import type { Scenario } from '@core/model';
import { storage } from '@app/services';

/**
 * Local draft of a scenario, saved explicitly (Save, Ctrl/Cmd+S) rather than debounced,
 * so tab close can warn instead of losing the last edit.
 */
export function useScenarioDraft(saved: Scenario, onError: (message: string) => void) {
  const [draft, setDraft] = useState(saved);
  // Revisions, not a flag: edits made while a save is in flight stay dirty.
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const dirty = rev !== savedRev;

  const update = (patch: Partial<Scenario>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setRev((r) => r + 1);
  };

  /** Resolves true once stored; failures go to `onError`. */
  const save = (): Promise<boolean> => {
    const at = rev;
    return storage.putScenario({ ...draft, updatedAt: Date.now() }).then(
      () => {
        setSavedRev(at);
        return true;
      },
      (e: unknown) => {
        onError(e instanceof Error ? e.message : String(e));
        return false;
      },
    );
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  });

  return { draft, dirty, update, save };
}
