import { useState } from 'react';
import type { ProviderConfig } from '@core/model';
import type { ProviderHealth } from '@core/ports';
import { DEFAULT_APP_SETTINGS, providerFor } from '@app/services';
import { Button } from '@ui/components/ui/button';
import { Card } from '@ui/components/ui/card';
import { Input, Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Switch } from '@ui/components/ui/switch';
import { BACKENDS, TEMPLATES } from './backends';
import { ConnectionCard } from './ConnectionCard';

const KINDS = BACKENDS.filter((b) => b.kind === 'llama-server' || b.kind === 'openai-compat');
const DEFAULT_URL = 'http://localhost:8081';

const utilityConfig = (kind: ProviderConfig['kind'], baseUrl: string, template: ProviderConfig['template']): ProviderConfig => ({
  id: 'utility',
  role: 'utility',
  kind,
  name: `Utility (${baseUrl})`,
  baseUrl,
  ...(template && { template }),
});

interface Props {
  value: ProviderConfig | undefined;
  onChange: (next: ProviderConfig | undefined) => void;
}

/** Optional second model server for memories and summaries; the URL is normalised when settings are drafted. */
export function UtilityCard({ value, onChange }: Props) {
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const set = (patch: Partial<Pick<ProviderConfig, 'kind' | 'baseUrl' | 'template'>>) => {
    const next = { kind: value?.kind ?? 'llama-server', baseUrl: value?.baseUrl ?? DEFAULT_URL, template: value?.template ?? 'chatml', ...patch };
    onChange(utilityConfig(next.kind, next.baseUrl, next.template));
    setHealth(null);
  };
  const test = async () => {
    if (value) setHealth(await providerFor({ ...DEFAULT_APP_SETTINGS, providers: [value] }, value.id).health());
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <SectionLabel className="grow">Utility model</SectionLabel>
        <Switch aria-label="Use a utility model" checked={!!value} onChange={(on) => (on ? set({}) : onChange(undefined))} />
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        A small instruct model (e.g. 3-4B) on a second llama-server; summaries stop competing with the story slot.
      </p>
      {value && (
        <>
          <div className="flex items-center gap-2.5">
            <Select
              aria-label="Utility backend"
              className="h-9 w-48"
              value={value.kind}
              onChange={(e) => set({ kind: KINDS.find((k) => k.kind === e.target.value)?.kind ?? 'llama-server' })}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Utility template"
              className="h-9 w-36"
              value={value.template ?? 'chatml'}
              onChange={(e) => set({ template: TEMPLATES.find((t) => t.value === e.target.value)?.value ?? 'chatml' })}
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2.5">
            <Input
              aria-label="Utility server URL"
              className="h-9 font-mono text-caption"
              value={value.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
            />
            <Button onClick={() => void test()}>Test</Button>
          </div>
          {health && <ConnectionCard health={health} caps={null} />}
        </>
      )}
    </Card>
  );
}
