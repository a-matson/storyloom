import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PlayerTurnType } from '@core/engine';
import type { GameApi } from '../hooks/useGame';
import { IconSend, IconStop } from './Icons';

type Mode = PlayerTurnType | 'see';

const MODES: { id: Mode; label: string; prefix: string; hint: string; color: string }[] = [
  { id: 'do', label: 'Do', prefix: '›', hint: 'What do you do?', color: 'var(--mode-do)' },
  { id: 'say', label: 'Say', prefix: '“', hint: 'What do you say?', color: 'var(--mode-say)' },
  { id: 'story', label: 'Story', prefix: '¶', hint: 'Narrate what happens next', color: 'var(--mode-story)' },
  { id: 'see', label: 'See', prefix: '◉', hint: 'Describe an image, or leave blank to auto-prompt (needs an image backend)', color: 'var(--mode-see)' },
];

interface Props {
  busy: boolean;
  canRetry: boolean;
  canErase: boolean;
  status: string;
  api: GameApi;
  onSee?: (prompt: string) => void;
}

/**
 * Take-a-turn row: mode chips, the input, and Continue / Retry / Erase.
 * Keyboard: Enter sends, Ctrl/⌘+Enter continues, Ctrl/⌘+R retries,
 * Ctrl/⌘+Z undoes (when the input is empty). Typing `/` opens commands:
 * /do /say /story /see switch mode; /reset is reserved (retry cache).
 */
export function CommandRow({ busy, canRetry, canErase, status, api, onSee }: Props) {
  const [mode, setMode] = useState<Mode>('do');
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const m = MODES.find((x) => x.id === mode)!;

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const send = () => {
    if (busy) return;
    const raw = text;
    const slash = raw.match(/^\/(do|say|story|see)\s*(.*)$/s);
    if (slash) {
      setMode(slash[1] as Mode);
      setText(slash[2] ?? '');
      return;
    }
    setText('');
    if (mode === 'see') {
      onSee?.(raw.trim());
      return;
    }
    if (!raw.trim() && mode !== 'story') {
      api.submit('continue', '');
      return;
    }
    api.submit(mode, raw);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && mod) {
      e.preventDefault();
      api.submit('continue', '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      send();
    } else if (mod && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      api.retry();
    } else if (mod && e.key.toLowerCase() === 'z' && !text) {
      e.preventDefault();
      if (e.shiftKey) api.redo();
      else api.undo();
    }
  };

  return (
    <footer className="command">
      <div className="inner">
        <div className="row">
          {MODES.map((x) => (
            <button key={x.id} className="chip" data-mode={x.id} aria-pressed={x.id === mode} onClick={() => setMode(x.id)} disabled={busy}>
              {x.label}
            </button>
          ))}
          <span className="grow" />
          <span className="small muted row">
            <span className={`dot ${busy ? 'busy' : 'ok'}`} />
            {status}
          </span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label htmlFor="turn-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Take a turn
          </label>
          <div className="turn-input" style={{ ['--mode-color' as string]: m.color }}>
            <span className="prefix" aria-hidden>
              {m.prefix}
            </span>
            <input id="turn-input" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={m.hint} disabled={busy} autoComplete="off" />
            {busy ? (
              <button className="send" aria-label="Stop generating" onClick={api.cancel} style={{ background: 'var(--danger)' }}>
                <IconStop />
              </button>
            ) : (
              <button className="send" aria-label="Send" onClick={send}>
                <IconSend />
              </button>
            )}
          </div>
          <button className="btn lg" onClick={() => api.submit('continue', '')} disabled={busy}>
            Continue
          </button>
          <button className="btn lg" onClick={api.retry} disabled={busy || !canRetry}>
            Retry
          </button>
          <button className="btn lg danger" onClick={api.erase} disabled={busy || !canErase}>
            Erase
          </button>
        </div>
        <div className="hint">Enter send · Ctrl+Enter continue · Ctrl+R retry · Ctrl+Z undo · /do /say /story /see</div>
      </div>
    </footer>
  );
}
