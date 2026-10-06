import { Dexie, type EntityTable, type Table } from 'dexie';
import type { AppSettings, Scenario, TurnTrace } from '@core/model';
import { splitAdventure, type ActionRow, type AdventureRow, type CardRow, type EntityRow, type ImageRow, type MemoryRow } from './rows';
import type { Adventure } from '@core/model';

export class StoryloomDb extends Dexie {
  adventures!: EntityTable<AdventureRow, 'id'>;
  actions!: Table<ActionRow, [string, number]>;
  storyCards!: Table<CardRow, [string, string]>;
  memories!: Table<MemoryRow, [string, string]>;
  entities!: Table<EntityRow, [string, string]>;
  scenarios!: EntityTable<Scenario, 'id'>;
  settings!: Table<AppSettings, string>;
  traces!: Table<TurnTrace, string>;
  images!: Table<ImageRow, [string, string]>;

  constructor(name = 'storyloom') {
    super(name);
    // Version 1 replaces the hand-written IndexedDB v1 store, which kept whole adventures in one record.
    this.version(1)
      .stores({
        adventures: 'id, updatedAt',
        actions: '[adventureId+seq], adventureId',
        storyCards: '[adventureId+id], adventureId',
        memories: '[adventureId+id], adventureId',
        scenarios: 'id, updatedAt',
        settings: '',
      })
      .upgrade(async (tx) => {
        const whole = await tx.table<Adventure, string>('adventures').toArray();
        for (const a of whole) {
          if (!Array.isArray(a.actions)) continue; // already split
          const rows = splitAdventure({ ...a, entities: [] }); // v1 records predate entities
          await tx.table('actions').bulkPut(rows.actions);
          await tx.table('storyCards').bulkPut(rows.cards);
          await tx.table('memories').bulkPut(rows.memories);
          await tx.table('adventures').put(rows.meta);
        }
      });
    // Version 2 only adds the (empty) traces table; Dexie carries the v1 tables over.
    this.version(2).stores({ traces: 'turnId, adventureId, [adventureId+createdAt]' });
    // Version 3 only adds the (empty) images table.
    this.version(3).stores({ images: '[adventureId+id], adventureId' });
    // Version 4 only adds the (empty) entities table; stored adventures parse with none.
    this.version(4).stores({ entities: '[adventureId+id], adventureId' });
  }
}
