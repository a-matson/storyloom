import type { Action, Adventure, AppSettings, Entity, Memory, Scenario, StoryCard, TurnTrace } from '@core/model';
import { StorageError, summarise, TRACE_CAP_PER_ADVENTURE, type AdventureSummary, type Storage } from '@core/ports';
import * as S from '@core/schema';
import { clearPending, takePending } from '../pending';
import { StoryloomDb } from './db';
import { joinAdventure, splitAdventure, toActionRow, toCardRow, toEntityRow, toMemoryRow } from './rows';

interface Saved {
  actions: readonly Action[];
  cards: readonly StoryCard[];
  memories: readonly Memory[];
  entities: readonly Entity[];
}

const saved = (a: Adventure): Saved => ({ actions: a.actions, cards: a.storyCards, memories: a.memories, entities: a.entities });

function parseOrThrow<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } },
  value: unknown,
  what: string,
): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  throw new StorageError(`${what} is damaged: ${first ? `${first.path.join('.')}: ${first.message}` : 'invalid'}`);
}

/**
 * Per-record storage: actions, cards and memories each have a table, so a save writes only what
 * changed. Change detection is by object identity, which holds because actions, cards and
 * memories are immutable values (the action log and memory bank return new objects).
 */
export class DexieStorage implements Storage {
  private readonly db: StoryloomDb;
  private readonly saved = new Map<string, Saved>();

  constructor(name?: string) {
    this.db = new StoryloomDb(name);
  }

  async init(): Promise<void> {
    await this.db.open();
  }

  async listAdventures(): Promise<AdventureSummary[]> {
    const metas = (await this.db.adventures.orderBy('updatedAt').toArray()).toReversed();
    return Promise.all(
      metas.map(async (m) => {
        const summary = summarise({ ...m, actions: [], memories: [], storyCards: [], entities: [] });
        summary.actionCount = await this.db.actions.where('adventureId').equals(m.id).count();
        return summary;
      }),
    );
  }

  async getAdventure(id: string): Promise<Adventure | undefined> {
    const db = this.db;
    const rows = await db.transaction('r', [db.adventures, db.actions, db.storyCards, db.memories, db.entities], async () => {
      const meta = await db.adventures.get(id);
      if (!meta) return undefined;
      const by = <T>(t: { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<T[]> } } }) => t.where('adventureId').equals(id).toArray();
      return joinAdventure(meta, await by(db.actions), await by(db.storyCards), await by(db.memories), await by(db.entities));
    });
    if (rows === undefined) return undefined;
    const adventure = parseOrThrow(S.Adventure, rows, `Adventure "${id}"`);
    this.saved.set(id, saved(adventure));
    // Edits made inside the save debounce before the tab hid: replay them before anyone sees the adventure.
    const pending = takePending(adventure);
    if (!pending) return adventure;
    await this.putAdventure(pending);
    clearPending();
    return pending;
  }

  async putAdventure(a: Adventure): Promise<void> {
    const db = this.db;
    const prev = this.saved.get(a.id);
    await db.transaction('rw', [db.adventures, db.actions, db.storyCards, db.memories, db.entities], async () => {
      if (!prev) {
        // Unknown baseline: replace everything for this adventure.
        const rows = splitAdventure(a);
        await Promise.all([db.actions, db.storyCards, db.memories, db.entities].map((t) => t.where('adventureId').equals(a.id).delete()));
        await Promise.all([
          db.adventures.put(rows.meta),
          db.actions.bulkPut(rows.actions),
          db.storyCards.bulkPut(rows.cards),
          db.memories.bulkPut(rows.memories),
          db.entities.bulkPut(rows.entities),
        ]);
        return;
      }
      const { meta } = splitAdventure({ ...a, actions: [], storyCards: [], memories: [], entities: [] });
      await db.adventures.put(meta);
      await db.actions.bulkPut(a.actions.flatMap((x, i) => (prev.actions[i] === x ? [] : [toActionRow(a.id, x, i)])));
      if (prev.actions.length > a.actions.length) await db.actions.where('[adventureId+seq]').between([a.id, a.actions.length], [a.id, Infinity]).delete();
      await syncById(db.storyCards, a.id, prev.cards, a.storyCards, (c) => toCardRow(a.id, c));
      await syncById(db.memories, a.id, prev.memories, a.memories, (m) => toMemoryRow(a.id, m));
      await syncById(db.entities, a.id, prev.entities, a.entities, (e) => toEntityRow(a.id, e));
    });
    this.saved.set(a.id, saved(a));
  }

  async deleteAdventure(id: string): Promise<void> {
    const db = this.db;
    await db.transaction('rw', [db.adventures, db.actions, db.storyCards, db.memories, db.entities, db.traces, db.images], async () => {
      await db.adventures.delete(id);
      await Promise.all([db.actions, db.storyCards, db.memories, db.entities, db.traces, db.images].map((t) => t.where('adventureId').equals(id).delete()));
    });
    this.saved.delete(id);
  }

  async putImage(adventureId: string, id: string, blob: Blob): Promise<void> {
    await this.db.images.put({ adventureId, id, blob, createdAt: Date.now() });
  }

  async getImage(adventureId: string, id: string): Promise<Blob | undefined> {
    return (await this.db.images.get([adventureId, id]))?.blob;
  }

  async deleteImage(adventureId: string, id: string): Promise<void> {
    await this.db.images.delete([adventureId, id]);
  }

  async putTrace(t: TurnTrace): Promise<void> {
    const db = this.db;
    await db.transaction('rw', db.traces, async () => {
      await db.traces.put(t);
      const byAge = db.traces.where('[adventureId+createdAt]').between([t.adventureId, -Infinity], [t.adventureId, Infinity]);
      const overflow = (await byAge.count()) - TRACE_CAP_PER_ADVENTURE;
      if (overflow > 0) await db.traces.bulkDelete(await byAge.limit(overflow).primaryKeys());
    });
  }

  async getTrace(turnId: string): Promise<TurnTrace | undefined> {
    const r = await this.db.traces.get(turnId);
    return r && parseOrThrow(S.TurnTrace, r, `Trace "${turnId}"`);
  }

  async listTraces(adventureId: string): Promise<TurnTrace[]> {
    const rows = await this.db.traces.where('[adventureId+createdAt]').between([adventureId, -Infinity], [adventureId, Infinity]).toArray();
    return rows.toReversed().map((r) => parseOrThrow(S.TurnTrace, r, `Trace "${r.turnId}"`));
  }

  async listScenarios(): Promise<Scenario[]> {
    const rows = (await this.db.scenarios.orderBy('updatedAt').toArray()).toReversed();
    return rows.map((r) => parseOrThrow(S.Scenario, r, `Scenario "${r.id}"`));
  }
  async getScenario(id: string): Promise<Scenario | undefined> {
    const r = await this.db.scenarios.get(id);
    return r && parseOrThrow(S.Scenario, r, `Scenario "${id}"`);
  }
  async putScenario(s: Scenario): Promise<void> {
    await this.db.scenarios.put(s);
  }
  async deleteScenario(id: string): Promise<void> {
    const db = this.db;
    // A scenario cover is an image row owned by the scenario id, so it goes with the scenario.
    await db.transaction('rw', [db.scenarios, db.images], async () => {
      await db.scenarios.delete(id);
      await db.images.where('adventureId').equals(id).delete();
    });
  }

  async getSettings(): Promise<AppSettings | undefined> {
    const raw = await this.db.settings.get('app');
    return raw && parseOrThrow(S.AppSettings, raw, 'Settings');
  }
  async putSettings(s: AppSettings): Promise<void> {
    await this.db.settings.put(s, 'app');
  }

  async exportAll() {
    const ids = await this.db.adventures.toCollection().primaryKeys();
    const adventures = (await Promise.all(ids.map((id) => this.getAdventure(id)))).filter((a) => a !== undefined);
    return { adventures, scenarios: await this.listScenarios(), settings: await this.getSettings() };
  }
  async importAll(data: { adventures?: Adventure[]; scenarios?: Scenario[] }): Promise<void> {
    for (const a of data.adventures ?? []) await this.putAdventure(a);
    for (const s of data.scenarios ?? []) await this.putScenario(s);
  }
}

/** Writes items whose identity changed and deletes ids that disappeared. */
async function syncById<T extends { id: string }, R>(
  table: { bulkPut: (rows: R[]) => Promise<unknown>; bulkDelete: (keys: [string, string][]) => Promise<void> },
  adventureId: string,
  prev: readonly T[],
  next: readonly T[],
  toRow: (item: T) => R,
): Promise<void> {
  const before = new Map(prev.map((x) => [x.id, x]));
  await table.bulkPut(next.filter((x) => before.get(x.id) !== x).map(toRow));
  const nextIds = new Set(next.map((x) => x.id));
  await table.bulkDelete(prev.filter((x) => !nextIds.has(x.id)).map((x): [string, string] => [adventureId, x.id]));
}
