import { newId, type Adventure, type AppSettings, type Entity } from '@core/model';
import { trackJob } from '@core/trace';
import { downscale } from '../image';
import { PORTRAIT_NEGATIVE, portraitPrompt, portraitStyle } from './portraitPrompt';
import type { SessionServices } from './types';

export interface PortraitHost {
  adv: Adventure;
  app: AppSettings;
  svc: SessionServices;
  /** The adventure changed in place: publish and save. */
  changed: () => void;
}

/** SD 1.5's native size; it cannot draw a face at the size it is shown. */
const RENDER_PX = 512;
/** 2x the 64 CSS px the drawer shows [provisional]. */
export const PORTRAIT_PX = 128;

/** Characters tried this page load: a failing render is not retried every idle period. */
const tried = new Set<string>();

const find = (host: PortraitHost, id: string) => host.adv.entities.find((e) => e.id === id);

/**
 * Between turns: one character without a portrait at a time, until none is left or the next
 * turn starts. A render already running is not cut (the server would finish it anyway). A
 * failure is console-only: the player did not ask, and the initials avatar is a full answer.
 */
export async function queuePortraits(host: PortraitHost, idle: AbortSignal): Promise<void> {
  if (!host.adv.settings.image.portraits || !host.svc.imageProviderFor(host.app)) return;
  for (;;) {
    const next = host.adv.entities.find((e) => e.kind === 'character' && e.portraitId === undefined && !tried.has(e.id));
    if (idle.aborted || !next) return;
    tried.add(next.id);
    await renderPortrait(host, next.id).catch((e: unknown) => console.warn(`no portrait for ${next.name}`, e));
  }
}

/** Render a new portrait for `id`, replacing the old one. Dropped if the entity was deleted or given another portrait meanwhile. */
export async function renderPortrait(host: PortraitHost, id: string): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!pending) throw new Error('No image server is configured; add one in Settings.');
  const e = find(host, id);
  if (!e) return;
  const s = host.adv.settings.image;
  const req = {
    prompt: portraitPrompt(e, s.portraitStyle ?? portraitStyle(host.adv.tags)),
    negativePrompt: [PORTRAIT_NEGATIVE, s.negativePrompt].filter(Boolean).join(', '),
    width: RENDER_PX,
    height: RENDER_PX,
    steps: s.steps,
    cfgScale: s.cfgScale,
    model: s.model,
  };
  const provider = await pending;
  const blob = await trackJob('image', () => provider.txt2img(req, AbortSignal.timeout(host.svc.imageTimeoutMs)));
  if (find(host, id)?.portraitId !== e.portraitId) return;
  await setPortrait(host, id, await downscale(blob, PORTRAIT_PX));
}

/** Store `blob` (already downscaled) as `id`'s portrait; the old blob is dropped. */
export async function setPortrait(host: PortraitHost, id: string, blob: Blob): Promise<void> {
  if (!find(host, id)) return;
  const portraitId = newId('img_');
  await host.svc.storage.putImage(host.adv.id, portraitId, blob);
  const old = find(host, id)?.portraitId;
  update(host, id, (e) => ({ ...e, portraitId }));
  if (old !== undefined) dropPortrait(host, old);
}

export function clearPortrait(host: PortraitHost, id: string): void {
  const old = find(host, id)?.portraitId;
  if (old === undefined) return;
  update(host, id, ({ portraitId: _cleared, ...e }) => e);
  dropPortrait(host, old);
}

export const dropPortrait = (host: PortraitHost, imageId: string): void =>
  void host.svc.storage.deleteImage(host.adv.id, imageId).catch((e: unknown) => console.warn('could not delete the old portrait', e));

function update(host: PortraitHost, id: string, fn: (e: Entity) => Entity): void {
  host.adv.entities = host.adv.entities.map((e) => (e.id === id ? fn(e) : e));
  host.changed();
}
