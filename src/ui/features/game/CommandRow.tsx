import { lazy, Suspense, useEffect, useState, type KeyboardEvent } from 'react';
import { correct } from '@app/session/correct';
import { setTime, travelTo, waitFor } from '@app/session/clock';
import { addRule } from '@app/session/rules';
import { markChapter } from '@app/session/chapters';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { StatusDot } from '@ui/components/ui/status-dot';
import { cn } from '@ui/lib/utils';
import type { PaletteProps } from './CommandPalette';
import { MODE_IDS, MODES, parseSlash, type Command, type Mode } from './modes';
import { TurnInput } from './TurnInput';

interface Props {
  busy: boolean;
  canRetry: boolean;
  /** The last output answers a Do the dice rolled for. */
  canReroll?: boolean;
  canErase: boolean;
  /** Someone is present to play a beat. */
  canBeat?: boolean;
  status: string;
  api: GameApi;
  onSee?: (prompt: string) => void;
  /** A prefetched alternative exists: Retry is instant. */
  retryReady?: boolean;
  onViewContext: () => void;
}

// Lazy: opened by Ctrl/⌘+K only.
const CommandPalette = lazy(async () => ({ default: (await import('./CommandPalette')).CommandPalette }));

/** Ctrl/⌘+K anywhere in the game, except while a passage is edited in place: the edit keeps its own keys. */
function Palette(props: Omit<PaletteProps, 'onClose'>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !(e.target instanceof HTMLElement && e.target.isContentEditable)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <Suspense fallback={null}>{open && <CommandPalette {...props} onClose={() => setOpen(false)} />}</Suspense>;
}

// Loaded on first use: start-up bundle budget.
const beat = (api: GameApi, text = '') => import('@app/session/beat').then((m) => m.beat(api, text));

const COMMANDS: Record<Command, (api: GameApi, text: string) => Promise<void> | void> = {
  correct,
  rule: addRule,
  wait: waitFor,
  time: setTime,
  travel: travelTo,
  beat,
  complicate: (api) => import('@app/session/beat').then((m) => m.complicate(api)),
  tension: (api, text) => import('@app/session/beat').then((m) => m.setTension(api, text)),
  chapter: markChapter,
};

const chip =
  'h-[34px] rounded-full border border-border bg-secondary px-3.5 text-control font-medium text-foreground aria-pressed:font-semibold aria-pressed:text-lantern-ink';

function RetryButtons({ busy, canRetry, canReroll, retryReady, api }: Pick<Props, 'busy' | 'canRetry' | 'api'> & { canReroll: boolean; retryReady: boolean }) {
  return (
    <>
      <Button
        size="lg"
        onClick={() => api.retry()}
        disabled={busy || !canRetry}
        title={retryReady ? 'An alternative is ready — retry is instant' : undefined}
        className={retryReady ? 'border-verdigris hover:border-verdigris' : undefined}
      >
        Retry{retryReady ? ' ·' : ''}
      </Button>
      {canReroll && (
        <Button size="lg" onClick={() => api.retry(undefined, true)} disabled={busy} title="Roll the dice again and retry">
          Re-roll
        </Button>
      )}
    </>
  );
}

/**
 * Take-a-turn row. Enter sends, Ctrl/⌘+Enter continues, Ctrl/⌘+R retries,
 * Ctrl/⌘+Z undoes (input empty); `/do /say /story /see` switch mode, `/correct …` pins a fact, `/rule …` adds a rule,
 * `/wait 3 hours | until night` and `/time evening, day 2` set the scene's time, `/travel <place> [alone]` its location,
 * `/chapter [title]` starts a chapter with the next action.
 */
export function CommandRow({ busy, canRetry, canReroll = false, canErase, canBeat = false, status, api, onSee, retryReady = false, onViewContext }: Props) {
  const [mode, setMode] = useState<Mode>('do');
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const typing = focused && text.trim() !== '';
  useEffect(() => api.setTyping(typing), [api, typing]);

  const send = () => {
    if (busy) return;
    const slash = parseSlash(text);
    if (slash && slash.kind !== 'mode') {
      if (slash.text.trim() !== '' || slash.kind === 'beat' || slash.kind === 'complicate' || slash.kind === 'chapter') setText('');
      void COMMANDS[slash.kind](api, slash.text);
      return;
    }
    if (slash) {
      setMode(slash.mode);
      setText(slash.rest);
      return;
    }
    setText('');
    if (mode === 'see') onSee?.(text.trim());
    // An empty Do/Say means "continue the story".
    else if (text.trim() === '' && mode !== 'story') api.submit('continue', '');
    else api.submit(mode, text);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-2.5">
          <TurnInput mode={mode} text={text} busy={busy} onText={setText} onKeyDown={onKey} onSend={send} onStop={api.cancel} onFocusChange={setFocused} />
          <Button size="lg" onClick={() => api.submit('continue', '')} disabled={busy}>
            Continue
          </Button>
          <Button size="lg" onClick={() => void beat(api)} disabled={busy || !canBeat} title="A character does something">
            Beat
          </Button>
          <RetryButtons busy={busy} canRetry={canRetry} canReroll={canReroll} retryReady={retryReady} api={api} />
          <Button size="lg" danger onClick={api.erase} disabled={busy || !canErase}>
            Erase
          </Button>
        </div>
        <div className="font-mono text-label text-muted-foreground">
          Enter send · Ctrl+Enter continue · Ctrl+K all commands · {[...MODE_IDS, ...Object.keys(COMMANDS)].map((c) => `/${c}`).join(' ')}
        </div>
        <Palette api={api} draft={(d) => ('mode' in d ? setMode(d.mode) : setText(d.text))} onViewContext={onViewContext} />
      </div>
    </footer>
  );
}
