import { useState } from 'react';
import type { ProviderConfig } from '@core/model';
import { DEFAULT_APP_SETTINGS, imageProviderFor } from '@app/services';
import { Button } from '@ui/components/ui/button';
import { Card } from '@ui/components/ui/card';
import { Input } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Switch } from '@ui/components/ui/switch';

const DEFAULT_URL = 'http://localhost:7860';

// Forge, SD.Next, A1111 and KoboldCpp all speak /sdapi/v1, so there is one kind and one adapter.
const imageConfig = (baseUrl: string): ProviderConfig => ({ id: 'image', role: 'image', kind: 'a1111', name: `Images (${baseUrl})`, baseUrl });

interface Props {
  value: ProviderConfig | undefined;
  onChange: (next: ProviderConfig | undefined) => void;
}

/** Optional image server for See mode; the URL is normalised when settings are drafted. */
export function ImageCard({ value, onChange }: Props) {
  const [models, setModels] = useState<string[] | null>(null);
  const [samplers, setSamplers] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const set = (baseUrl: string) => {
    onChange(imageConfig(baseUrl));
    setModels(null);
    setSamplers(null);
    setError('');
  };
  const test = async () => {
    if (!value) return;
    setError('');
    const pending = imageProviderFor({ ...DEFAULT_APP_SETTINGS, providers: [value] });
    try {
      const provider = await pending;
      setModels((await provider?.models()) ?? null);
      // Older servers lack the route; the sidebar's Sampler field is free text then.
      const listed = await provider?.samplers().catch((err: unknown) => console.warn('the image server did not list its samplers', err));
      setSamplers(listed ?? null);
    } catch (e) {
      setModels(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <SectionLabel className="grow">Image server</SectionLabel>
        <Switch aria-label="Use an image server" checked={!!value} onChange={(on) => (on ? set(DEFAULT_URL) : onChange(undefined))} />
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        Stable Diffusion behind an A1111-compatible API (Forge, SD.Next, A1111 with <code>--api</code>, or KoboldCpp with <code>--sdmodel</code>). See mode
        generates pictures from your prompt. Pick the checkpoint and size per adventure, in the sidebar.
      </p>
      {value && (
        <>
          <div className="flex items-center gap-2.5">
            <Input aria-label="Image server URL" className="h-9 font-mono text-caption" value={value.baseUrl} onChange={(e) => set(e.target.value)} />
            <Button onClick={() => void test()}>Test</Button>
          </div>
          {models && (
            <p className="m-0 text-caption text-muted-foreground">
              {models.length === 0 ? 'Connected, but the server has no checkpoints loaded.' : `Connected · ${models.length} checkpoints: ${models.join(', ')}`}
              {samplers && ` · ${samplers.length} samplers`}
            </p>
          )}
          {error !== '' && <p className="m-0 text-caption text-danger">{error}</p>}
        </>
      )}
    </Card>
  );
}
