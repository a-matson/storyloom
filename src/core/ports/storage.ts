import type { Adventure, AppSettings, Scenario } from '../model/types';

/** Persistence boundary; small so another backend (SQLite on OPFS, Tauri) can replace IndexedDB. */
export interface AdventureSummary {
  id: string;
  title: string;
  actionCount: number;
  updatedAt: number;
  coverUrl?: string | undefined;
  modelId?: string | undefined;
}

export interface Storage {
  init(): Promise<void>;

  listAdventures(): Promise<AdventureSummary[]>;
  getAdventure(id: string): Promise<Adventure | undefined>;
  putAdventure(a: Adventure): Promise<void>;
  deleteAdventure(id: string): Promise<void>;

  listScenarios(): Promise<Scenario[]>;
  getScenario(id: string): Promise<Scenario | undefined>;
  putScenario(s: Scenario): Promise<void>;
  deleteScenario(id: string): Promise<void>;

  getSettings(): Promise<AppSettings | undefined>;
  putSettings(s: AppSettings): Promise<void>;

  /** Everything, for backup. */
  exportAll(): Promise<{ adventures: Adventure[]; scenarios: Scenario[]; settings?: AppSettings | undefined }>;
  importAll(data: { adventures?: Adventure[]; scenarios?: Scenario[] }): Promise<void>;
}

export function summarise(a: Adventure): AdventureSummary {
  return { id: a.id, title: a.title, actionCount: a.actions.length, updatedAt: a.updatedAt, coverUrl: a.coverUrl, modelId: a.settings.modelId };
}

/** A stored record failed validation or the database refused an operation. */
export class StorageError extends Error {
  readonly kind = 'storage';
}
