import type { z } from 'zod/mini';
import * as S from '../schema';
import type * as X from '../schema/extraction';

/**
 * Core data model: types inferred from the zod schemas in `core/schema`, the single source of truth.
 * Everything is plain JSON-serialisable data so it can live in IndexedDB, be exported, and cross to workers.
 *
 * Naming follows the AI Dungeon vocabulary so community knowledge and scripts transfer:
 * Adventure, Scenario, Story Card, Plot Essentials, Author's Note, Memory Bank, Story Summary.
 */
export type ActionType = z.output<typeof S.ActionType>;
export type Action = z.output<typeof S.Action>;
/** Who speaks in one paragraph of an action's active text. */
export type Speaker = NonNullable<Action['speakers']>[number];
export type TurnTrace = z.output<typeof S.TurnTrace>;
export type HelperCall = z.output<typeof S.HelperCall>;
export type TurnKind = z.output<typeof S.TurnKind>;
export type TurnOutcome = z.output<typeof S.TurnOutcome>;
export type TurnErrorKind = z.output<typeof S.TurnErrorKind>;
export type JobKind = z.output<typeof S.JobKind>;
export type PlotComponents = z.output<typeof S.PlotComponents>;
export type Scene = z.output<typeof S.Scene>;
export type StoryCard = z.output<typeof S.StoryCard>;
export type Memory = z.output<typeof S.Memory>;
export type Entity = z.output<typeof S.Entity>;
export type EntityFact = z.output<typeof S.EntityFact>;
export type LegacyEntity = z.output<typeof S.LegacyEntity>;
export type Rule = z.output<typeof S.Rule>;
export type Assertion = z.output<typeof S.Assertion>;
export type ExtractedEntity = z.output<typeof X.ExtractedEntity>;
export type ExtractionJson = z.output<typeof X.ExtractionJson>;
export type TemplateId = z.output<typeof S.TemplateId>;
export type ModelSettings = z.output<typeof S.ModelSettings>;
export type AdventureSettings = z.output<typeof S.AdventureSettings>;
export type ScriptState = z.output<typeof S.ScriptState>;
export type Adventure = z.output<typeof S.Adventure>;
export type Scenario = z.output<typeof S.Scenario>;
export type ProviderConfig = z.output<typeof S.ProviderConfig>;
export type AppSettings = z.output<typeof S.AppSettings>;
export type ImagePreset = z.output<typeof S.ImagePreset>;

export function actionText(a: Action): string {
  return a.versions[a.active] ?? a.versions.at(-1) ?? '';
}

export const DEFAULT_ADVENTURE_SETTINGS: AdventureSettings = S.AdventureSettings.parse({});

let counter = 0;
/** Small unique id; prefer crypto.randomUUID when available. */
export function newId(prefix = ''): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID();
  counter += 1;
  return `${prefix}${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** How many of the four script hooks have code. */
export function scriptCount(scripts: Adventure['scripts']): number {
  return Object.values(scripts ?? {}).filter((code) => code.trim() !== '').length;
}

/** Any script to run? Lives here, not in `scenario.ts`, so the start-up chunk can ask without pulling the editor model in. */
export function hasScripts(scripts: Adventure['scripts']): scripts is NonNullable<Adventure['scripts']> {
  return scriptCount(scripts) > 0;
}

/** The second, small model server for memory jobs, if one is configured. */
export const utilityProvider = (app: AppSettings): ProviderConfig | undefined => app.providers.find((p) => p.role === 'utility');

/** Helper reads that can each run on the story or the utility model. */
export type ReadKind = 'scene' | 'state' | 'batch' | 'memory' | 'summary' | 'check' | 'card';

/**
 * The reads `readsOn: 'bench'` sends to the utility model: those it won on the bench. None: Qwen2.5-3B abliterated
 * lost every read to the 12B (scene present 1/30 vs 21/30, state 19 vs 67 accepted, batch 0 vs 3 cards), 3x faster.
 * [measured: 2026-10-14-state-m13-6-qwen3b.json, 2026-10-14-state-m13-6-wayfarer.json]
 */
export const UTILITY_READS: ReadonlySet<ReadKind> = new Set();

/** Whether `read` asks for the utility model; the caller still needs one configured and reachable. */
export const readsOnUtility = (app: Pick<AppSettings, 'readsOn'>, read: ReadKind): boolean =>
  app.readsOn === 'utility' || (app.readsOn === 'bench' && UTILITY_READS.has(read));

/** The image server for See mode, if one is configured. */
export const imageProvider = (app: AppSettings): ProviderConfig | undefined => app.providers.find((p) => p.role === 'image');
