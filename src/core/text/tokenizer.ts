/**
 * Token counting abstraction.
 *
 * The context builder is synchronous and calls `count` many times per turn,
 * so tokenizers must be cheap. The default is a calibrated heuristic; when a
 * backend exposes /tokenize (llama-server) the app measures the real
 * chars-per-token ratio on the adventure's own text and feeds it back via
 * `calibrate()`, which keeps the budget maths within a few percent without a
 * network round-trip per section.
 */

export interface Tokenizer {
  count(text: string): number;
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
