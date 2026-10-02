import { useState, type KeyboardEvent } from 'react';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { StatusDot } from '@ui/components/ui/status-dot';
import { cn } from '@ui/lib/utils';
import { MODE_IDS, MODES, parseSlash, type Mode } from './modes';
import { TurnInput } from './TurnInput';

interface Props {
  busy: boolean;
  canRetry: boolean;
  canErase: boolean;
  status: string;
  api: GameApi;
  onSee?: (prompt: string) => void;
  /** A prefetched alternative exists: Retry is instant. */
  retryReady?: boolean;
}

const chip =
  'h-[34px] rounded-full border border-border bg-secondary px-3.5 text-control font-medium text-foreground aria-pressed:font-semibold aria-pressed:text-lantern-ink';

/**
 * Take-a-turn row. Enter sends, Ctrl/⌘+Enter continues, Ctrl/⌘+R retries,
 * Ctrl/⌘+Z undoes (input empty); `/do /say /story /see` switch mode.
 */
export function CommandRow({ busy, canRetry, canErase, status, api, onSee, retryReady = false }: Props) {
  const [mode, setMode] = useState<Mode>('do');
  const [text, setText] = useState('');

  const send = () => {
    if (busy) return;
    const slash = parseSlash(text);
    if (slash) {
      setMode(slash[0]);
      setText(slash[1]);
      return;
    }
    setText('');
    if (mode === 'see') onSee?.(text.trim());
    // An empty Do/Say means "continue the story".
    else if (text.trim() === '' && mode !== 'story') api.submit('continue', '');
    else api.submit(mode, text);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mod) api.submit('continue', '');
      else send();
    } else if (mod && key === 'r') {
      e.preventDefault();
      api.retry();
    } else if (mod && key === 'z' && text === '') {
      e.preventDefault();
      if (e.shiftKey) api.redo();
      else api.undo();
    }
  };

  return (
    <footer className="flex shrink-0 justify-center border-t border-border bg-bar px-10 pt-3.5 pb-[18px] max-sm:px-3 max-sm:pt-2.5 max-sm:pb-3.5">
      <div className="flex w-full max-w-story flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {MODE_IDS.map((id) => (
            <button key={id} type="button" className={cn(chip, MODES[id].chip)} aria-pressed={id === mode} onClick={() => setMode(id)} disabled={busy}>
              {MODES[id].label}
            </button>
          ))}
          <span className="grow" />
          <span className="flex items-center gap-2 text-caption text-muted-foreground">
            <StatusDot status={busy ? 'busy' : 'ok'} />
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <TurnInput mode={mode} text={text} busy={busy} onText={setText} onKeyDown={onKey} onSend={send} onStop={api.cancel} />
          <Button size="lg" onClick={() => api.submit('continue', '')} disabled={busy}>
            Continue
          </Button>
          <Button
            size="lg"
            onClick={api.retry}
            disabled={busy || !canRetry}
            title={retryReady ? 'An alternative is ready — retry is instant' : undefined}
            className={retryReady ? 'border-verdigris hover:border-verdigris' : undefined}
          >
            Retry{retryReady ? ' ·' : ''}
          </Button>
          <Button size="lg" danger onClick={api.erase} disabled={busy || !canErase}>
            Erase
          </Button>
        </div>
        <div className="font-mono text-label text-muted-foreground">Enter send · Ctrl+Enter continue · Ctrl+R retry · Ctrl+Z undo · /do /say /story /see</div>
      </div>
    </footer>
  );
}
