import { createAdventureFromScenario, type Adventure, type AppSettings, type Scenario } from '@core/model';
import { openingRequest, writeOpening } from '@core/cards';
import { providerFor, storage } from './services';

export interface Started {
  adventure: Adventure;
  /** Set when the Character Creator opening could not be written; the composed prompt was kept. */
  warning?: string | undefined;
}

/**
 * The one way a scenario becomes a stored adventure (play-test now, the library later).
 * `s` is the leaf the player reached; `root` (a Multiple Choice tree) names the adventure.
 */
export async function startScenario(s: Scenario, answers: Record<string, string>, app: AppSettings, picked: string[] = [], root = s): Promise<Started> {
  let adventure = { ...createAdventureFromScenario(s, answers, app.defaults, picked), scenarioId: root.id, title: root.title };
  let warning: string | undefined;
  const start = adventure.actions[0];
  if (s.type === 'characterCreator' && start) {
    const deps = { provider: providerFor(app, app.defaults.providerId), template: app.defaults.template };
    const opening = await writeOpening(openingRequest(s, adventure), deps).catch((e: unknown) => {
      warning = `Could not write the opening (${e instanceof Error ? e.message : String(e)}); started from the scenario prompt.`;
      return null;
    });
    if (opening !== null) adventure = { ...adventure, actions: [{ ...start, versions: [opening] }] };
  }
  await storage.putAdventure(adventure);
  return { adventure, warning };
}
