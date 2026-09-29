import type { Adventure, AppSettings, Scenario } from '@core/types';
import { summarise, type AdventureSummary, type Storage } from './types';

/** In-memory storage for tests and for environments without IndexedDB. */
export class MemoryStorage implements Storage {
  private adventures = new Map<string, Adventure>();
  private scenarios = new Map<string, Scenario>();
  private settings: AppSettings | undefined;

  async init(): Promise<void> {}

  async listAdventures(): Promise<AdventureSummary[]> {
    return [...this.adventures.values()].map(summarise).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getAdventure(id: string): Promise<Adventure | undefined> {
    return this.adventures.get(id);
  }
  async putAdventure(a: Adventure): Promise<void> {
    this.adventures.set(a.id, structuredClone(a));
  }
  async deleteAdventure(id: string): Promise<void> {
    this.adventures.delete(id);
  }

  async listScenarios(): Promise<Scenario[]> {
    return [...this.scenarios.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getScenario(id: string): Promise<Scenario | undefined> {
    return this.scenarios.get(id);
  }
  async putScenario(s: Scenario): Promise<void> {
    this.scenarios.set(s.id, structuredClone(s));
  }
  async deleteScenario(id: string): Promise<void> {
    this.scenarios.delete(id);
  }

  async getSettings(): Promise<AppSettings | undefined> {
    return this.settings;
  }
  async putSettings(s: AppSettings): Promise<void> {
    this.settings = structuredClone(s);
  }

  async exportAll() {
    return { adventures: [...this.adventures.values()], scenarios: [...this.scenarios.values()], settings: this.settings };
  }
  async importAll(data: { adventures?: Adventure[]; scenarios?: Scenario[] }): Promise<void> {
    for (const a of data.adventures ?? []) this.adventures.set(a.id, a);
    for (const s of data.scenarios ?? []) this.scenarios.set(s.id, s);
  }
}
