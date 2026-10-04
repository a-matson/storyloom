import { clearPending, markPending } from '@adapters/storage';
import type { Adventure } from '@core/model';

interface Deps {
  /** The current working copy, with the action log folded in. */
  adventure: () => Adventure;
  delayMs: () => number;
  write: (a: Adventure) => Promise<void>;
  onError: (message: string) => void;
}

/**
 * Debounced persistence for one adventure, plus the synchronous marker a hiding page needs:
 * the Dexie write cannot finish before unload, so `persistNow` records the adventure in
 * localStorage first and the next open replays it.
 */
export class SaveQueue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  schedule(): void {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.deps.delayMs());
  }

  /** Write now; used by the debounce, on close and after a page-hide marker. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const adventure = this.deps.adventure();
    adventure.updatedAt = Date.now();
    try {
      await this.deps.write(adventure);
      this.dirty = false;
      clearPending();
    } catch (e) {
      this.deps.onError(e instanceof Error ? e.message : String(e));
    }
  }

  /** The page is hiding or unloading: record the unsaved adventure, then start the real write. */
  readonly persistNow = (): void => {
    if (!this.dirty) return;
    const adventure = this.deps.adventure();
    adventure.updatedAt = Date.now();
    markPending(adventure);
    void this.flush();
  };
}
