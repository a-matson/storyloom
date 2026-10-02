import { Dexie, type EntityTable, type Table } from 'dexie';
import type { AppSettings, Scenario } from '@core/model';
import { splitAdventure, type ActionRow, type AdventureRow, type CardRow, type MemoryRow } from './rows';
import type { Adventure } from '@core/model';

export class StoryloomDb extends Dexie {
  adventures!: EntityTable<AdventureRow, 'id'>;
  actions!: Table<ActionRow, [string, number]>;
  storyCards!: Table<CardRow, [string, string]>;
  memories!: Table<MemoryRow, [string, string]>;
  scenarios!: EntityTable<Scenario, 'id'>;
  settings!: Table<AppSettings, string>;

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
          const rows = splitAdventure(a);
          await tx.table('actions').bulkPut(rows.actions);
          await tx.table('storyCards').bulkPut(rows.cards);
          await tx.table('memories').bulkPut(rows.memories);
          await tx.table('adventures').put(rows.meta);
        }
      });
  }
}
