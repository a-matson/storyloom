import { z } from 'zod/mini';
import type { Adventure } from '@core/model';
import { newId } from '@core/model';
import * as S from '@core/schema';

export const FORMAT = 'storyloom-adventure';

const AdventureExport = z.object({ format: z.literal(FORMAT), version: z.literal(1), exportedAt: z.optional(z.string()), adventure: S.Adventure });

export function exportAdventureJson(a: Adventure): string {
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), adventure: a }, null, 2);
}

/** Plain-text transcript (what a reader would want). */
export function exportAdventureText(a: Adventure): string {
  return a.actions
    .filter((x) => x.type !== 'see')
    .map((x) => x.versions[x.active] ?? '')
    .join('\n\n');
}

/** Our export or a bare adventure; undefined when the data is neither. Throws with the field path when it is ours but damaged. */
export function parseOwn(data: unknown): Adventure | undefined {
  const wrapped = AdventureExport.safeParse(data);
  if (wrapped.success) return renumber(wrapped.data.adventure);
  if (isRecord(data) && data['format'] === FORMAT) throw new Error(`Damaged Storyloom export: ${firstIssue(wrapped.error)}`);
  const bare = S.Adventure.safeParse(data);
  return bare.success ? renumber(bare.data) : undefined;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function firstIssue(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  const i = error.issues[0];
  return i ? `${i.path.join('.') || '(root)'}: ${i.message}` : 'invalid';
}

/** Fresh ids so an import never overwrites an existing adventure. */
function renumber(a: Adventure): Adventure {
  return {
    ...a,
    id: newId('adv_'),
    actions: a.actions.map((x) => ({ ...x, id: newId('act_') })),
    storyCards: a.storyCards.map((c) => ({ ...c, id: newId('card_') })),
    memories: [], // embeddings may come from another embedder; rebuilt lazily
    updatedAt: Date.now(),
  };
}
