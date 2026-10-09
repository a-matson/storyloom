import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Adventure, AppSettings } from '@core/model';
import { openSession } from '@app/services';
import type { GameSession, GameSnapshot } from '@app/session';

/** Opens `initial` as a session for the component's lifetime; re-renders on every snapshot. */
export function useGameSession(initial: Adventure, app: AppSettings): [GameSnapshot, GameSession] {
  const [session] = useState(() => openSession(initial, app));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => session.setApp(app), [session, app]);
  useEffect(() => {
    // Hiding the tab is the last reliable moment to save; `pagehide` also covers a desktop close.
    const onHide = () => {
      if (document.visibilityState === 'hidden') session.persistNow();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', session.persistNow);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', session.persistNow);
    };
  }, [session]);
  useEffect(() => {
    session.open();
    return () => {
      // Unmounted: no UI left to show a save error in.
      session.close().catch((e: unknown) => console.error('Could not save adventure on close:', e));
    };
  }, [session]);
  return [snapshot, session];
}

export type GameApi = GameSession;
