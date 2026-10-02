/**
 * Parse a text/event-stream response body into JSON data events.
 * Handles `data: {...}` lines and ignores comments / other fields.
 */
export async function* readSse(res: Response, signal?: AbortSignal): AsyncGenerator {
  if (!res.body) throw new Error('Streaming response has no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          yield JSON.parse(payload);
        } catch {
          // ignore malformed line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class ProviderError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<T> {
  const res = await fetchFn(url, { ...init, signal: signal ?? null });
  if (!res.ok) throw new ProviderError(`${init.method ?? 'GET'} ${url} → ${res.status} ${res.statusText}`, res.status);
  return (await res.json()) as T;
}
