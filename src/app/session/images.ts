import type { ActionLog } from '@core/log';
import { newId, type Action, type Adventure, type AppSettings } from '@core/model';
import { trackJob } from '@core/trace';
import type { SessionServices } from './types';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Image = NonNullable<Action['image']>;

interface SeeHost {
  adv: Adventure;
  log: ActionLog;
  app: AppSettings;
  svc: SessionServices;
  /** The log changed: publish a snapshot and save. */
  changed: () => void;
  onError: (message: string) => void;
}

/**
 * See mode. The `see` action is appended at once so the caption is on screen while the
 * image server works; the blob lands in storage and `imageId` is patched in afterwards.
 * Image generation never blocks a turn: `busy` stays false and the story stays playable.
 */
export function seeImage(prompt: string, host: SeeHost): void {
  const text = prompt.trim();
  // M7-2 turns a blank prompt into one generated from the story so far.
  if (text === '') return host.onError('Describe what you want to see.');
  const model = host.adv.settings.image.model;
  const image: Image = { prompt: text, ...(model !== undefined && { model }) };
  const action = host.log.append('see', '', { image });
  host.changed();
  void generate(host, action.id, image);
}

async function generate(host: SeeHost, actionId: string, image: Image): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!pending) return host.onError('No image server is configured; add one in Settings.');
  const s = host.adv.settings.image;
  try {
    const provider = await pending;
    const blob = await trackJob('image', () =>
      provider.txt2img({
        prompt: image.prompt,
        width: s.width,
        height: s.height,
        steps: s.steps,
        cfgScale: s.cfgScale,
        negativePrompt: s.negativePrompt,
        sampler: s.sampler,
        model: s.model,
      }),
    );
    const imageId = newId('img_');
    await host.svc.storage.putImage(host.adv.id, imageId, blob);
    host.log.patch(actionId, { image: { ...image, imageId } });
    host.changed();
  } catch (e) {
    // The caption stays without a picture; Retry on the action is M7-3.
    host.onError(`Could not generate the image: ${message(e)}`);
  }
}
