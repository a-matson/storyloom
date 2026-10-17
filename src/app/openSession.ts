import type { Adventure, AppSettings } from '@core/model';
import { GameSession } from './session';
import { embedderFor, imageProviderFor, providerFor, scriptsFor, storage, tokenizer, tokenizerFor } from './services';

// Not in `services.ts`: the library screen imports that, and the session would pull the context builder into start-up.

/** Opens an adventure as a session wired to the app-wide services. */
export function openSession(adventure: Adventure, app: AppSettings): GameSession {
  return new GameSession(adventure, app, {
    providerFor,
    imageProviderFor,
    embedderFor,
    tokenizer,
    tokenizerFor,
    scriptsFor,
    storage,
    idle: (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn) : setTimeout(fn, 800)),
    frame: (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)),
    saveDelayMs: 300,
    rewarmDelayMs: 1000, // [provisional]
    // Well above the 130 s a 512²/24-step render takes with the story model on the same GPU
    // [measured: docs/measurements/2026-10-05-play-images.json], so only a hung server is killed.
    imageTimeoutMs: 300_000, // [provisional]
    // A cold 8k prefill is ~50 s on the M2 Pro, and a memory job on slot 1 can add tens of seconds.
    ttftTimeoutMs: 90_000, // [provisional]
  });
}
