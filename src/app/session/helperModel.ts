import type { Adventure, AppSettings } from '@core/model';
import { contentClause } from '@core/text';
import type { HelperModel, SessionServices } from './types';

/**
 * The story provider and template with the "record" content clause. Image prompts always run on it:
 * a small instruct utility model softens or refuses mature scenes.
 */
export const storyModel = ({ app, adv, svc }: { app: AppSettings; adv: Adventure; svc: SessionServices }): HelperModel => ({
  provider: svc.providerFor(app, adv.settings.providerId),
  template: adv.settings.template,
  content: contentClause(adv.settings, 'record'),
});
