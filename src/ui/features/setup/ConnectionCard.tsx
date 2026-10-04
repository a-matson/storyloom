import type { TemplateId } from '@core/model';
import type { ProviderCapabilities, ProviderHealth } from '@core/ports';
import { Card } from '@ui/components/ui/card';
import { Pill } from '@ui/components/ui/pill';
import { StatusDot } from '@ui/components/ui/status-dot';
import { CAPABILITIES, TEMPLATES } from './backends';

const mono = 'font-mono text-caption';

function Details({ health }: { health: ProviderHealth }) {
  if (!health.ok) return health.message;
  return (
    <>
      {(health.version ?? '') === '' ? '' : `${health.version} · `}model <span className={mono}>{health.modelId ?? 'unknown'}</span>
      {(health.contextSize ?? 0) > 0 ? ` · ${health.contextSize?.toLocaleString()} ctx` : ''}
      {(health.slots ?? 0) > 0 ? ` · ${health.slots} slots` : ''}
    </>
  );
}

interface Props {
  health: ProviderHealth;
  caps: ProviderCapabilities | null;
  /** null/absent: not checked (no server template, or the check failed). */
  templateOk?: boolean | null;
  template?: TemplateId;
}

export function ConnectionCard({ health, caps, templateOk = null, template = 'chatml' }: Props) {
  return (
    <Card className="flex flex-col gap-2 bg-bar">
      <div className="flex items-center gap-2">
        <StatusDot status={health.ok ? 'ok' : 'bad'} />
        <span className="font-semibold">{health.ok ? 'Connected' : 'Not reachable'}</span>
        <span className="text-caption text-prose">
          <Details health={health} />
        </span>
      </div>
      {caps && (
        <div className="flex flex-wrap items-center gap-1.5">
          {CAPABILITIES.map((c) => (
            <Pill key={c.key} tone={caps[c.key] === true ? 'auto' : 'plain'} className="text-caption normal-case tracking-normal">
              {caps[c.key] === true ? '✓' : '✗'} {c.label}
            </Pill>
          ))}
        </div>
      )}
      {templateOk === false && (
        <p role="alert" className="m-0 text-caption text-lantern">
          The server's chat template renders differently from {TEMPLATES.find((t) => t.value === template)?.label ?? template}. Pick the model's template in the
          adventure settings, or prompts may be malformed.
        </p>
      )}
      {!health.ok && (
        <p className="m-0 text-caption text-muted-foreground">
          Start the server first, e.g. <span className={mono}>llama-server -m model.gguf -c 16384 -ngl 99 --port 8080</span>. If the browser blocks the request,
          the server must allow cross-origin calls (llama-server does; Ollama needs <span className={mono}>OLLAMA_ORIGINS=*</span>).
        </p>
      )}
    </Card>
  );
}
