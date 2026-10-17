import type { Assertion } from '@core/model';

/** The store as it stood before action `i`: said earlier, and still true then. */
export const storeAt = (all: readonly Assertion[], i: number): Assertion[] =>
  all
    .filter((a) => a.at < i)
    .map((a) => {
      if (a.until === undefined || a.until < i) return a;
      const c = structuredClone(a);
      delete c.until;
      return c;
    });
