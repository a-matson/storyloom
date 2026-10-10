import { useEffect, useState } from 'react';
import type { AppSettings } from '@core/model';
import type { ImageProvider } from '@core/ports';
import { imageProviderFor } from '@app/services';
import { Input, Select } from '@ui/components/ui/field';

const FIELD = 'h-8 w-45';

/** What the image server offers; `null` while loading, or when it cannot say (no server, no route). */
export interface ServerLists {
  models: string[] | null;
  samplers: string[] | null;
}

export function useServerLists(app: AppSettings): ServerLists {
  const [lists, setLists] = useState<ServerLists>({ models: null, samplers: null });
  // One cached promise per image server, so this refetches when the server changes, not on every app-settings save.
  const pending = imageProviderFor(app);
  useEffect(() => {
    const ctl = new AbortController();
    const fetchList = (key: keyof ServerLists, get: (p: ImageProvider) => Promise<string[]>) =>
      pending
        ?.then(get)
        .then((names) => setLists((l) => ({ ...l, [key]: names })))
        .catch((e: unknown) => {
          // Closing the section aborts the request; that is not the server's fault.
          if (!ctl.signal.aborted) console.warn(`the image server did not list its ${key}`, e);
        });
    void fetchList('models', (p) => p.models(ctl.signal));
    void fetchList('samplers', (p) => p.samplers(ctl.signal));
    return () => ctl.abort();
  }, [pending]);
  return lists;
}

/**
 * A Select of the server's names, with "Server default" as blank. A stored name the server does
 * not list stays selectable, so it is never silently dropped. Free text when there is no list.
 */
export function ServerChoice(props: { id: string; value: string | undefined; options: string[] | null; onChange: (value: string | undefined) => void }) {
  const { id, value, options, onChange } = props;
  if (!options || options.length === 0) {
    return <Input id={id} className={FIELD} value={value ?? ''} onChange={(e) => onChange(e.target.value.trim() === '' ? undefined : e.target.value)} />;
  }
  const names = value === undefined || options.includes(value) ? options : [value, ...options];
  return (
    <Select id={id} className={FIELD} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}>
      <option value="">Server default</option>
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </Select>
  );
}
