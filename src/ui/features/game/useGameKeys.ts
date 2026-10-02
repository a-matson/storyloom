import { useEffect } from 'react';

const SHEET_MAX_WIDTH = 1100; // below this the sidebar is an overlay sheet

/** Escape closes the context drawer, then the sidebar sheet; Ctrl/⌘+. toggles the sidebar. */
export function useGameKeys(
  showContext: boolean,
  showSidebar: boolean,
  setShowContext: (v: boolean) => void,
  setShowSidebar: (fn: (v: boolean) => boolean) => void,
) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showContext) setShowContext(false);
        else if (showSidebar && window.innerWidth <= SHEET_MAX_WIDTH) setShowSidebar(() => false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        setShowSidebar((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showContext, showSidebar, setShowContext, setShowSidebar]);
}

export const sidebarOpenByDefault = () => window.innerWidth > SHEET_MAX_WIDTH;
