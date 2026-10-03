/**
 * Token counting abstraction.
 *
 * The context builder is synchronous and calls `count` many times per turn,
 * so tokenizers must be cheap. The default is a calibrated heuristic: the app
 * measures the real chars-per-token ratio from the backend's prompt token count
 * and feeds it back via `calibrate()`. When the backend exposes /tokenize
 * (llama-server), `createExactTokenizer` wraps it with cached exact counts.
 */

export interface Tokenizer {
  count(text: string): number;
  /** Replace the estimates made since the last call with exact counts; true when any arrived, so the caller rebuilds. */
  resolve?(): Promise<boolean>;
}

/** Exact counts kept; a turn re-tokenises only the new action and the re-rendered sections. [provisional] */
const EXACT_CACHE_SIZE = 4000;

/**
 * Exact counts from the backend (llama-server `/tokenize`), cached by text. `count` stays
 * synchronous: a text not yet in the cache is estimated by `fallback` and fetched on `resolve`.
 */
export function createExactTokenizer(fallback: Tokenizer, tokenize: (text: string) => Promise<number>): Tokenizer {
  const cache = new Map<string, number>();
  let misses = new Set<string>();
  return {
    count(text) {
      if (!text) return 0;
      const n = cache.get(text);
      if (n === undefined) {
        misses.add(text);
        return fallback.count(text);
      }
      // Re-insert so the Map's order is least-recently-used first.
      cache.delete(text);
      cache.set(text, n);
      return n;
    },
    async resolve() {
      const texts = [...misses];
      misses = new Set();
      if (!texts.length) return false;
      try {
        const counts = await Promise.all(texts.map(tokenize));
        texts.forEach((t, i) => cache.set(t, counts[i] ?? 0));
      } catch (e) {
        console.warn('/tokenize failed; token counts stay estimates', e);
        return false;
      }
      for (const key of cache.keys()) {
        if (cache.size <= EXACT_CACHE_SIZE) break;
        cache.delete(key);
      }
      return true;
    },
  };
}

export interface CalibratedTokenizer extends Tokenizer {
  charsPerToken: number;
  calibrate(sample: string, realTokenCount: number): void;
}

/**
 * Word/punctuation-aware estimate. English prose on modern BPE tokenizers
 * lands around 3.8–4.2 chars/token; dialogue-heavy text is lower.
 */
export function createApproxTokenizer(charsPerToken = 3.9): CalibratedTokenizer {
  const t: CalibratedTokenizer = {
    charsPerToken,
    count(text: string): number {
      if (!text) return 0;
      // Blend of character ratio and word count: robust for both prose and
      // punctuation-heavy text (dialogue, lists, scripts).
      const chars = text.length;
      const words = (text.match(/\S+/g) ?? []).length;
      const byChars = chars / t.charsPerToken;
      const byWords = words * 1.3;
      return Math.ceil(byChars * 0.6 + byWords * 0.4);
    },
    calibrate(sample: string, realTokenCount: number) {
      if (!sample || realTokenCount <= 0) return;
      const measured = sample.length / realTokenCount;
      // Exponential moving average so a single odd sample doesn't swing it.
      t.charsPerToken = t.charsPerToken * 0.5 + measured * 0.5;
    },
  };
  return t;
}

/**
 * Trim `text` from the end so that it fits in `maxTokens`. Works with any
 * tokenizer via binary search on character length; cuts at a whitespace
 * boundary when one is near.
 */
export function trimToTokens(text: string, maxTokens: number, tokenizer: Tokenizer): string {
  if (maxTokens <= 0) return '';
  if (tokenizer.count(text) <= maxTokens) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tokenizer.count(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  let cut = lo;
  const back = text.lastIndexOf(' ', cut);
  if (back > cut - 40 && back > 0) cut = back;
  return text.slice(0, cut).trimEnd();
}

/**
 * Trim `text` from the START (keep the tail). Used for over-long single
 * actions that must be included in full but cannot be.
 */
export function trimHeadToTokens(text: string, maxTokens: number, tokenizer: Tokenizer): string {
  if (maxTokens <= 0) return '';
  if (tokenizer.count(text) <= maxTokens) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tokenizer.count(text.slice(text.length - mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(text.length - lo).trimStart();
}
