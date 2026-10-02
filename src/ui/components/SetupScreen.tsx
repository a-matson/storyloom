import { useEffect, useState } from 'react';
import type { AppSettings, ProviderConfig } from '@core/model';
import { guessTemplate } from '@core/text';
import { findPreset } from '@core/text';
import { providerFor } from '@app/services';
import type { ProviderCapabilities, ProviderHealth } from '@core/ports';
import { IconBack } from './Icons';

interface Props {
  app: AppSettings;
  onSave: (next: AppSettings) => void;
  onBack?: () => void;
  firstRun?: boolean;
}

const KINDS: {
  kind: ProviderConfig['kind'];
  name: string;
  blurb: string;
  url: string;
}[] = [
  {
    kind: 'demo',
    name: 'Demo (no GPU)',
    blurb: 'Canned prose to try the app. No model needed.',
    url: 'demo',
  },
  {
    kind: 'llama-server',
    name: 'llama-server',
    blurb: 'Recommended. All samplers, prefix cache, tokenize, grammar.',
    url: 'http://localhost:8080',
  },
  {
    kind: 'koboldcpp',
    name: 'KoboldCpp',
    blurb: 'One binary; text plus built-in image generation.',
    url: 'http://localhost:5001',
  },
  {
    kind: 'ollama',
    name: 'Ollama',
    blurb: 'Easiest install. Set OLLAMA_ORIGINS for the browser.',
    url: 'http://localhost:11434',
  },
  {
    kind: 'openai-compat',
    name: 'OpenAI-compatible',
    blurb: 'LM Studio, vLLM, TabbyAPI: /v1/completions.',
    url: 'http://localhost:1234',
  },
];

/** Backend connection + app-level preferences. Doubles as the first-run screen. */
export function SetupScreen({ app, onSave, onBack, firstRun }: Props) {
  const current = app.providers.find((p) => p.id === app.defaultProviderId) ?? app.providers[0]!;
  const [kind, setKind] = useState<ProviderConfig['kind']>(current.kind);
  const [url, setUrl] = useState(current.baseUrl);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [caps, setCaps] = useState<ProviderCapabilities | null>(null);
  const [testing, setTesting] = useState(false);
  const [theme, setTheme] = useState(app.theme);

  useEffect(() => {
    setHealth(null);
    setCaps(null);
  }, [kind, url]);

  const draft = (): AppSettings => {
    const cfg: ProviderConfig = {
      ...current,
      kind,
      baseUrl: url.trim().replace(/\/$/, ''),
      name: `${KINDS.find((k) => k.kind === kind)?.name ?? kind} (${url})`,
    };
    const others = app.providers.filter((p) => p.id !== cfg.id);
    const modelId = health?.modelId;
    return {
      ...app,
      theme,
      providers: [cfg, ...others],
      defaultProviderId: cfg.id,
      defaults: {
        ...app.defaults,
        providerId: cfg.id,
        modelId,
        template: modelId ? guessTemplate(modelId) : app.defaults.template,
        model: {
          ...app.defaults.model,
          ...(modelId ? findPreset(modelId)?.settings : {}),
          contextLength: health?.contextSize ? Math.min(health.contextSize, 131072) : app.defaults.model.contextLength,
        },
      },
    };
  };

  const test = async () => {
    setTesting(true);
    const p = providerFor(draft(), current.id);
    const h = await p.health(); // never throws: failures come back as { ok: false }
    setHealth(h);
    if (h.ok) setCaps(await p.capabilities().catch(() => null));
    setTesting(false);
  };

  const capList: { key: keyof ProviderCapabilities; label: string }[] = [
    { key: 'streaming', label: 'streaming' },
    { key: 'topK', label: 'top-k' },
    { key: 'penalties', label: 'penalties' },
    { key: 'prefixCache', label: 'prefix cache' },
    { key: 'tokenize', label: 'tokenize' },
    { key: 'grammar', label: 'grammar / JSON' },
    { key: 'embeddings', label: 'embeddings' },
    { key: 'images', label: 'images' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        {onBack && (
          <button className="btn icon" aria-label="Back" onClick={onBack}>
            <IconBack />
          </button>
        )}
        <div className="title">Settings</div>
      </header>
      <div className="page" style={{ maxWidth: 880, alignSelf: 'center', width: '100%' }}>
        <div className="col" style={{ gap: 6 }}>
          {firstRun && (
            <span className="label" style={{ color: 'var(--lantern)' }}>
              First run
            </span>
          )}
          <h1 className="h">Connect an inference backend</h1>
          <p className="muted" style={{ margin: 0 }}>
            Storyloom runs entirely on your machine. Point it at a local server that hosts your story model; nothing leaves your computer.
          </p>
        </div>
        <div className="grid-4">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              className="tile"
              onClick={() => {
                setKind(k.kind);
                setUrl(k.url);
              }}
              style={{
                borderColor: kind === k.kind ? 'var(--lantern)' : undefined,
                background: kind === k.kind ? 'var(--bg-2)' : undefined,
              }}
            >
              <span style={{ fontWeight: 600 }}>{k.name}</span>
              <span className="small muted">{k.blurb}</span>
            </button>
          ))}
        </div>
        <label className="col">
          <span style={{ fontWeight: 600 }}>Server URL</span>
          <div className="row" style={{ gap: 10 }}>
            <input className="field mono" style={{ height: 44 }} value={url} readOnly={kind === 'demo'} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn lg" onClick={test} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>
        </label>
        {health && (
          <div className="card col" style={{ background: 'var(--bg-bar)' }}>
            <div className="row">
              <span className={`dot ${health.ok ? 'ok' : 'bad'}`} />
              <span style={{ fontWeight: 600 }}>{health.ok ? 'Connected' : 'Not reachable'}</span>
              <span className="small" style={{ color: 'var(--text-prose)' }}>
                {health.ok ? (
                  <>
                    {health.version ? `${health.version} · ` : ''}model <span className="mono">{health.modelId ?? 'unknown'}</span>
                    {health.contextSize ? ` · ${health.contextSize.toLocaleString()} ctx` : ''}
                    {health.slots ? ` · ${health.slots} slots` : ''}
                  </>
                ) : (
                  health.message
                )}
              </span>
            </div>
            {caps && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {capList.map((c) => (
                  <span
                    key={c.key}
                    className={`pill ${caps[c.key] ? 'auto' : ''}`}
                    style={{
                      textTransform: 'none',
                      letterSpacing: 0,
                      fontSize: 12,
                    }}
                  >
                    {caps[c.key] ? '✓' : '✗'} {c.label}
                  </span>
                ))}
              </div>
            )}
            {!health.ok && (
              <p className="small muted" style={{ margin: 0 }}>
                Start the server first, e.g. <span className="mono">llama-server -m model.gguf -c 16384 -ngl 99 --port 8080</span>. If the browser blocks the
                request, the server must allow cross-origin calls (llama-server does; Ollama needs <span className="mono">OLLAMA_ORIGINS=*</span>).
              </p>
            )}
          </div>
        )}
        <div className="card col">
          <span className="label">Appearance</span>
          <div className="setting">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              className="field"
              style={{ width: 160, height: 32 }}
              value={theme}
              onChange={(e) => setTheme(e.target.value as AppSettings['theme'])}
            >
              <option value="dark">Dark (Lantern &amp; Ink)</option>
              <option value="sepia">Sepia</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div className="row">
          <span className="small muted">You can change all of this later.</span>
          <span className="grow" />
          {firstRun && (
            <button className="btn lg ghost" onClick={() => onSave(draft())}>
              Skip for now
            </button>
          )}
          <button className="btn lg primary" onClick={() => onSave(draft())}>
            {firstRun ? 'Continue' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
