import type { Adventure, AppSettings, Scenario } from '@core/types';
import { summarise, type AdventureSummary, type Storage } from './types';

/**
 * IndexedDB storage, dependency-free. One database, three object stores.
 * Adventures are stored whole (actions included); at 5,000 actions that is a
 * few MB per record, well within limits. A SQLite backend (wa-sqlite on OPFS,
 * or Tauri's native SQLite) is the planned upgrade once per-action queries or
 * full-text search are needed — see docs/DECISIONS.md.
 */
const DB_NAME = 'storyloom';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IndexedDbStorage implements Storage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('adventures')) db.createObjectStore('adventures', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('scenarios')) db.createObjectStore('scenarios', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  private store(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('IndexedDbStorage not initialised');
    return this.db.transaction(name, mode).objectStore(name);
  }

  async listAdventures(): Promise<AdventureSummary[]> {
    const all = await req(this.store('adventures').getAll() as IDBRequest<Adventure[]>);
    return all.map(summarise).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getAdventure(id: string): Promise<Adventure | undefined> {
    return req(this.store('adventures').get(id) as IDBRequest<Adventure | undefined>);
  }
  async putAdventure(a: Adventure): Promise<void> {
    await req(this.store('adventures', 'readwrite').put(a));
  }
  async deleteAdventure(id: string): Promise<void> {
    await req(this.store('adventures', 'readwrite').delete(id));
  }

  async listScenarios(): Promise<Scenario[]> {
    const all = await req(this.store('scenarios').getAll() as IDBRequest<Scenario[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getScenario(id: string): Promise<Scenario | undefined> {
    return req(this.store('scenarios').get(id) as IDBRequest<Scenario | undefined>);
  }
  async putScenario(s: Scenario): Promise<void> {
    await req(this.store('scenarios', 'readwrite').put(s));
  }
  async deleteScenario(id: string): Promise<void> {
    await req(this.store('scenarios', 'readwrite').delete(id));
  }

  async getSettings(): Promise<AppSettings | undefined> {
    return req(this.store('settings').get('app') as IDBRequest<AppSettings | undefined>);
  }
  async putSettings(s: AppSettings): Promise<void> {
    await req(this.store('settings', 'readwrite').put(s, 'app'));
  }

  async exportAll() {
    const adventures = await req(this.store('adventures').getAll() as IDBRequest<Adventure[]>);
    const scenarios = await req(this.store('scenarios').getAll() as IDBRequest<Scenario[]>);
    const settings = await this.getSettings();
    return { adventures, scenarios, settings };
  }
  async importAll(data: { adventures?: Adventure[]; scenarios?: Scenario[] }): Promise<void> {
    for (const a of data.adventures ?? []) await this.putAdventure(a);
    for (const s of data.scenarios ?? []) await this.putScenario(s);
  }
}

export function createStorage(): Storage {
  return new IndexedDbStorage();
}
