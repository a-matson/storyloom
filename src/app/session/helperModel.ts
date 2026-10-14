import { contentClause, readsOnUtility, utilityProvider, type Adventure, type AppSettings, type ReadKind } from '@core/model';
import type { HelperModel, SessionServices } from './types';

type Host = { app: AppSettings; adv: Adventure; svc: SessionServices };

/**
 * The story provider and template with the "record" content clause. Image prompts always run on it:
 * a small instruct utility model softens or refuses mature scenes.
 */
export const storyModel = ({ app, adv, svc }: Host): HelperModel => ({
  provider: svc.providerFor(app, adv.settings.providerId),
  template: adv.settings.template,
  content: contentClause(adv.settings, 'record'),
  model: adv.settings.modelId,
});

/** The utility server when `readsOn` sends `read` there and it is reachable, else the story model; each with its own template. */
export async function helperModelFor(read: ReadKind, host: Host, onDown: (baseUrl: string) => void): Promise<HelperModel> {
  const utility = utilityProvider(host.app);
  if (utility && readsOnUtility(host.app, read)) {
    const provider = host.svc.providerFor(host.app, utility.id);
    const health = await provider.health();
    if (health.ok) return { ...storyModel(host), provider, template: utility.template ?? host.adv.settings.template, model: health.modelId };
    onDown(utility.baseUrl);
  }
  return storyModel(host);
}
