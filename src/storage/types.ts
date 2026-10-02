import type { Adventure, AppSettings, Scenario } from '@core/types';

/**
 * Persistence boundary. Milestone 1 ships IndexedDB (no dependency); the
 * interface is deliberately small so a SQLite (wa-sqlite/OPFS or Tauri)
 * implementation can replace it without touching the UI.
 */
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
