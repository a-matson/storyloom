import type { AdventureSettings } from '@core/model';
import { DEFAULT_ADVENTURE_SETTINGS } from '@core/model';
import { adventureFromData, type ImportResult } from './zip';

export { exportStoryCardsJson, importStoryCardsJson } from './cards';
export { exportAdventureJson, exportAdventureText, exportTracesJsonl } from './own';
export { exportScenarioJson, importScenarioJson } from './scenario';
export { importAidZip, type ImportResult } from './zip';

/** Our JSON export, a bare adventure, or an AI Dungeon adventure JSON. */
export function importAdventureJson(json: string, settings: AdventureSettings = DEFAULT_ADVENTURE_SETTINGS): ImportResult {
  const warnings: string[] = [];
  const adventure = adventureFromData(JSON.parse(json), warnings, settings);
  if (!adventure) throw new Error('Unrecognised adventure JSON.');
  return { adventure, warnings };
}
