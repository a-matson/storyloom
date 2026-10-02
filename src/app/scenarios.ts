import { createAdventureFromScenario, type Adventure, type AppSettings, type Scenario } from '@core/model';
import { storage } from './services';

/** The one way a scenario becomes a stored adventure (play-test now, the library later). */
export async function startScenario(s: Scenario, answers: Record<string, string>, app: AppSettings): Promise<Adventure> {
  const adv = createAdventureFromScenario(s, answers, app.defaults);
  await storage.putAdventure(adv);
  return adv;
}
