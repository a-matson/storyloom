import type { Adventure, AppSettings, Scenario, TurnTrace } from '../model/types';

/** Traces kept per adventure; the oldest are pruned on insert. [provisional] revisit when P7 measures growth. */
export const TRACE_CAP_PER_ADVENTURE = 200;

/** Persistence boundary; small so another backend (SQLite on OPFS, Tauri) can replace IndexedDB. */
export interface AdventureSummary {
  id: string;
  title: string;
  actionCount: number;
  updatedAt: number;
  coverUrl?: string | undefined;
  coverId?: string | undefined;
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

  /** Traces outlive the actions they point at; only deleting the adventure removes them. */
  putTrace(t: TurnTrace): Promise<void>;
  getTrace(turnId: string): Promise<TurnTrace | undefined>;
  /** Newest first. */
  listTraces(adventureId: string): Promise<TurnTrace[]>;

  /**
   * Generated images, keyed per owner — an adventure (See images, cover) or a scenario (cover).
   * Deleting the owner deletes them. Kept out of `exportAll` (own-format export is JSON).
   */
  putImage(ownerId: string, id: string, blob: Blob): Promise<void>;
  getImage(ownerId: string, id: string): Promise<Blob | undefined>;
  deleteImage(ownerId: string, id: string): Promise<void>;

  getSettings(): Promise<AppSettings | undefined>;
  putSettings(s: AppSettings): Promise<void>;

  /** Everything, for backup. */
  exportAll(): Promise<{ adventures: Adventure[]; scenarios: Scenario[]; settings?: AppSettings | undefined }>;
  importAll(data: { adventures?: Adventure[]; scenarios?: Scenario[] }): Promise<void>;
}

export function summarise(a: Adventure): AdventureSummary {
  return {
    id: a.id,
    title: a.title,
    actionCount: a.actions.length,
    updatedAt: a.updatedAt,
    coverUrl: a.coverUrl,
    coverId: a.coverId,
    modelId: a.settings.modelId,
  };
}

/** A stored record failed validation or the database refused an operation. */
export class StorageError extends Error {
  readonly kind = 'storage';
}
