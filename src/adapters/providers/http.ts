import { EventSourceParserStream } from 'eventsource-parser/stream';

interface Schema<T> {
  safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

export class ProviderError extends Error {
  readonly kind = 'provider';
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

function validate<T>(schema: Schema<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const i = r.error.issues[0];
  throw new ProviderError(`Unexpected ${what}${i ? ` (${i.path.join('.') || 'root'}: ${i.message})` : ''}`);
}

/** Throws a ProviderError carrying the HTTP status for non-2xx responses. */
export function ensureOk(res: Response, what: string): Response {
  if (!res.ok) throw new ProviderError(`${what} → ${res.status} ${res.statusText}`, res.status);
  return res;
}

export async function fetchJson<T>(fetchFn: typeof fetch, url: string, schema: Schema<T>, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const res = ensureOk(await fetchFn(url, { ...init, signal: signal ?? null }), `${init.method ?? 'GET'} ${url}`);
  return validate(schema, await res.json(), `response from ${url}`);
}

/** Validated JSON `data:` events of a text/event-stream body; `[DONE]` ends the stream. */
export async function* sseEvents<T>(res: Response, schema: Schema<T>, signal?: AbortSignal): AsyncGenerator<T> {
  if (!res.body) throw new ProviderError('Streaming response has no body');
  const reader = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).getReader();
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done || value.data === '[DONE]') return;
      let json: unknown;
      try {
        json = JSON.parse(value.data);
      } catch {
        throw new ProviderError(`Malformed stream event: ${value.data.slice(0, 80)}`);
      }
      yield validate(schema, json, 'stream event');
    }
  } finally {
    await reader.cancel().catch(() => undefined); // stream already closed or errored; nothing left to release
  }
}
