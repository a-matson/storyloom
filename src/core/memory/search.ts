import type { Adventure } from '../model/types';
import { bm25, buildIndex, tokenise, type Bm25Index } from './lexical';

// Loaded by the story search only, so it stays off the start-up bundle. It inlines `actionText` and `paragraphs`:
// importing them made the bundler split two more start-up chunks (+0.38 KB). [measured: scripts/size.ts]

export interface SearchDoc {
  id: string;
  text: string;
  /** Action index it points at. */
  at: number;
  paragraph?: number;
  kind: 'action' | 'memory' | 'event';
}

/** [provisional] long enough for a sentence either side of the hit on one line */
export const SNIPPET_CHARS = 120;

/** What the player can search: each paragraph of the story (See images left out), the memories and the events. */
export function searchDocs(adv: Pick<Adventure, 'actions' | 'memories' | 'assertions'>): SearchDoc[] {
  const actions = adv.actions.flatMap((a, at) =>
    a.type === 'see'
      ? []
      : (a.versions[a.active] ?? '')
          .split(/\n\s*\n/)
          .map((text, paragraph): SearchDoc => ({ id: `${a.id}:${paragraph}`, text, at, paragraph, kind: 'action' })),
  );
  const memories = adv.memories.flatMap((m): SearchDoc[] => (m.skipped || m.text === '' ? [] : [{ id: m.id, text: m.text, at: m.fromAction, kind: 'memory' }]));
  const events = adv.assertions.flatMap((a): SearchDoc[] =>
    a.kind === 'event' ? [{ id: a.id, text: a.text, at: a.at, ...(a.paragraph !== undefined && { paragraph: a.paragraph }), kind: 'event' }] : [],
  );
  return [...actions, ...memories, ...events];
}

// The adventure changes every turn, so a docs array is built per search session and its index cached with it.
const indexes = new WeakMap<readonly SearchDoc[], { index: Bm25Index; byId: Map<string, SearchDoc> }>();

/** The best `limit` docs for `query`, best first; an empty query finds nothing. */
export function searchStory(docs: readonly SearchDoc[], query: string, limit = 20): SearchDoc[] {
  const terms = tokenise(query);
  if (terms.length === 0) return [];
  let cached = indexes.get(docs);
  if (!cached) {
    cached = { index: buildIndex(docs), byId: new Map(docs.map((d) => [d.id, d])) };
    indexes.set(docs, cached);
  }
  const { index, byId } = cached;
  return bm25(index, terms)
    .slice(0, limit)
    .flatMap((id) => byId.get(id) ?? []);
}

/** Up to `SNIPPET_CHARS` of `text` around the first query word it holds, with … where it was cut. */
export function snippet(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SNIPPET_CHARS) return flat;
  const lower = flat.toLowerCase();
  const hits = tokenise(query)
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0);
  const hit = hits.length > 0 ? Math.min(...hits) : 0;
  const start = Math.max(0, Math.min(hit - SNIPPET_CHARS / 3, flat.length - SNIPPET_CHARS));
  const end = start + SNIPPET_CHARS;
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
