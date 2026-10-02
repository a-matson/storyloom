import { useEffect, useState } from 'react';

/**
 * Minimal hash router. Routes:
 *   #/                    library
 *   #/adventure/<id>      game screen
 *   #/scenario/<id>[/<childId>…]  scenario editor (child path: multiple-choice options)
 *   #/settings            backend + appearance
 *   #/setup               first run (same screen, no back button)
 * Reloading keeps you in the adventure; the browser back button works.
 */
export type Route =
  | { name: 'library' }
  | { name: 'adventure'; id: string }
  | { name: 'scenario'; id: string; path: string[] }
  | { name: 'settings' }
  | { name: 'setup' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [head, ...parts] = path.split('/');
  const rest = parts.map(decodeURIComponent);
  switch (head ?? '') {
    case 'adventure':
      return rest[0] ? { name: 'adventure', id: rest[0] } : { name: 'library' };
    case 'scenario':
      return rest[0] ? { name: 'scenario', id: rest[0], path: rest.slice(1) } : { name: 'library' };
    case 'settings':
      return { name: 'settings' };
    case 'setup':
      return { name: 'setup' };
    default:
      return { name: 'library' };
  }
}

export function routeToHash(r: Route): string {
  if (r.name === 'adventure') return `#/adventure/${encodeURIComponent(r.id)}`;
  if (r.name === 'scenario') return `#/${['scenario', r.id, ...r.path].map(encodeURIComponent).join('/')}`;
  return r.name === 'library' ? '#/' : `#/${r.name}`;
}

export function navigate(r: Route, replace = false): void {
  const hash = routeToHash(r);
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
