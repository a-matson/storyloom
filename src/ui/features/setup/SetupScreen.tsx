import { useState } from 'react';
import type { AppSettings, ProviderConfig } from '@core/model';
import type { ProviderCapabilities, ProviderHealth } from '@core/ports';
import { DEFAULT_PROVIDER_CONFIG, providerFor } from '@app/services';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { TopBar, TopBarTitle } from '@ui/components/ui/top-bar';
import { IconBack } from '@ui/components/Icons';
import { AppearanceCard } from './AppearanceCard';
import { BackendTiles } from './BackendTiles';
import { ConnectionCard } from './ConnectionCard';
import { draftSettings } from './draft';

interface Props {
  app: AppSettings;
  onSave: (next: AppSettings) => void;
  onBack?: () => void;
  firstRun?: boolean;
}

/** Backend connection + app-level preferences. Doubles as the first-run screen. */
export function SetupScreen({ app, onSave, onBack, firstRun = false }: Props) {
  const current = app.providers.find((p) => p.id === app.defaultProviderId) ?? app.providers[0] ?? DEFAULT_PROVIDER_CONFIG;
  const [kind, setKind] = useState<ProviderConfig['kind']>(current.kind);
  const [url, setUrl] = useState(current.baseUrl);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [caps, setCaps] = useState<ProviderCapabilities | null>(null);
  const [testing, setTesting] = useState(false);
  const [theme, setTheme] = useState(app.theme);

  const draft = () => draftSettings(app, { current, kind, url, theme, health });
  // A new backend or URL invalidates the last test.
  const choose = (nextKind: ProviderConfig['kind'], nextUrl: string) => {
    setKind(nextKind);
    setUrl(nextUrl);
    setHealth(null);
    setCaps(null);
  };
  const test = async () => {
    setTesting(true);
    const p = providerFor(draft(), current.id);
    const h = await p.health(); // never throws: failures come back as { ok: false }
    setHealth(h);
    if (h.ok) setCaps(await p.capabilities().catch(() => null));
    setTesting(false);
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar>
        {onBack && (
          <Button size="icon" aria-label="Back" onClick={onBack}>
            <IconBack />
          </Button>
        )}
        <TopBarTitle>Settings</TopBarTitle>
      </TopBar>
      <div className="flex w-full max-w-220 grow flex-col gap-7 self-center overflow-y-auto px-8 py-7 max-sm:p-4">
        <div className="flex flex-col gap-1.5">
          {firstRun && <SectionLabel className="text-lantern">First run</SectionLabel>}
          <h1 className="m-0 font-display text-title font-medium">Connect an inference backend</h1>
          <p className="m-0 text-muted-foreground">
            Storyloom runs entirely on your machine. Point it at a local server that hosts your story model; nothing leaves your computer.
          </p>
        </div>
        <BackendTiles kind={kind} onPick={choose} />
        <label htmlFor="server-url" className="flex flex-col gap-2">
          <span className="font-semibold">Server URL</span>
          <div className="flex items-center gap-2.5">
            <Input
              id="server-url"
              className="h-11 font-mono text-caption"
              value={url}
              readOnly={kind === 'demo'}
              onChange={(e) => choose(kind, e.target.value)}
            />
            <Button size="lg" onClick={() => void test()} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
          </div>
        </label>
        {health && <ConnectionCard health={health} caps={caps} />}
        <AppearanceCard theme={theme} onTheme={setTheme} />
        <div className="flex items-center gap-2">
          <span className="text-caption text-muted-foreground">You can change all of this later.</span>
          <span className="grow" />
          {firstRun && (
            <Button size="lg" variant="ghost" onClick={() => onSave(draft())}>
              Skip for now
            </Button>
          )}
          <Button size="lg" variant="primary" onClick={() => onSave(draft())}>
            {firstRun ? 'Continue' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
