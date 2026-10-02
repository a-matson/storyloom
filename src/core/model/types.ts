import type { z } from 'zod/mini';
import * as S from '../schema';

/**
 * Core data model: types inferred from the zod schemas in `core/schema`, the single source of truth.
 * Everything is plain JSON-serialisable data so it can live in IndexedDB, be exported, and cross to workers.
 *
 * Naming follows the AI Dungeon vocabulary so community knowledge and scripts transfer:
 * Adventure, Scenario, Story Card, Plot Essentials, Author's Note, Memory Bank, Story Summary.
 */
export type ActionType = z.output<typeof S.ActionType>;
export type GenerationStats = z.output<typeof S.GenerationStats>;
export type Action = z.output<typeof S.Action>;
export type PlotComponents = z.output<typeof S.PlotComponents>;
export type StoryCard = z.output<typeof S.StoryCard>;
export type Memory = z.output<typeof S.Memory>;
export type TemplateId = z.output<typeof S.TemplateId>;
export type ModelSettings = z.output<typeof S.ModelSettings>;
export type MemorySettings = z.output<typeof S.MemorySettings>;
export type ContextSettings = z.output<typeof S.ContextSettings>;
export type AdventureSettings = z.output<typeof S.AdventureSettings>;
export type ScriptMemory = z.output<typeof S.ScriptMemory>;
export type ScriptState = z.output<typeof S.ScriptState>;
export type Adventure = z.output<typeof S.Adventure>;
export type ScenarioType = z.output<typeof S.ScenarioType>;
export type ScenarioScripts = z.output<typeof S.ScenarioScripts>;
export type Scenario = z.output<typeof S.Scenario>;
export type ProviderConfig = z.output<typeof S.ProviderConfig>;
export type AppSettings = z.output<typeof S.AppSettings>;

export function actionText(a: Action): string {
  return a.versions[a.active] ?? a.versions.at(-1) ?? '';
}

export const DEFAULT_MODEL_SETTINGS: ModelSettings = S.ModelSettings.parse({});
export const DEFAULT_ADVENTURE_SETTINGS: AdventureSettings = S.AdventureSettings.parse({});

let counter = 0;
/** Small unique id; prefer crypto.randomUUID when available. */
export function newId(prefix = ''): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID();
  counter += 1;
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
