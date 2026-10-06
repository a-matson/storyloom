/**
 * The first JSON value in a model reply that `accept` takes, tolerating prose, fences and (with
 * `repair`) broken or cut-off JSON. Tries the whole reply, a fenced block, then the outermost braces.
 */
export function parseJsonReply<T>(text: string, accept: (data: unknown) => T | null, repair: (json: string) => string = (j) => j): T | null {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const candidates = [trimmed, fence, first >= 0 ? trimmed.slice(first, last > first ? last + 1 : undefined) : undefined];
  for (const c of candidates) {
    if (!c) continue;
    let data: unknown;
    try {
      data = JSON.parse(repair(c));
    } catch {
      continue; // not JSON even after repair; try the next candidate
    }
    const value = accept(data);
    if (value !== null) return value;
  }
  return null;
}
