import { newId, type Adventure, type AppSettings, type Entity } from '@core/model';
import { hashPrompt, trackJob } from '@core/trace';
import { downscale } from '../image';
import { imageQueue } from './imageQueue';
import { imageFailure } from './images';
import { PORTRAIT_NEGATIVE, portraitPrompt, portraitStyle } from './portraitPrompt';
import type { GameSnapshot, PortraitState, SessionServices } from './types';

export interface PortraitHost {
  adv: Adventure;
  app: AppSettings;
  svc: SessionServices;
  /** The adventure changed in place: publish and save. */
  changed: () => void;
  getSnapshot: () => GameSnapshot;
  emit: (patch: Partial<GameSnapshot>) => void;
}

/** 2x the 32 CSS px a portrait is shown at. */
export const PORTRAIT_PX = 64;
/** A failed portrait is tried again after this many turns, or as soon as a down image server answers. [provisional] */
export const PORTRAIT_RETRY_TURNS = 5;

const find = (host: PortraitHost, id: string) => host.adv.entities.find((e) => e.id === id);
const turns = (adv: Adventure) => adv.actions.filter((a) => a.type === 'continue').length;
/** Per entity, so a redraw of the same prompt keeps the face. A1111 seeds are 32-bit. */
const seedOf = (id: string) => parseInt(hashPrompt(id).slice(-8), 16);

/** `undefined` clears the entity's state. */
function setState(host: PortraitHost, id: string, state: PortraitState | undefined): void {
  const { [id]: _old, ...rest } = host.getSnapshot().portraitState;
  host.emit({ portraitState: state ? { ...rest, [id]: state } : rest });
}

/**
 * Between turns: one character without a portrait at a time, until none is left or the next
 * turn starts. A render already running is not cut (the server would finish it anyway). A
 * failure shows on the card, not as an error: the player did not ask.
 */
export async function queuePortraits(host: PortraitHost, idle: AbortSignal): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!host.adv.settings.image.portraits || !pending) return;
  const failed = Object.values(host.getSnapshot().portraitState).filter((s) => s.status === 'failed');
  const back = failed.some((s) => s.down) && (await (await pending).health());
  // Once per run: a retry that fails again must not loop.
  const tried = new Set<string>();
  for (;;) {
    const state = host.getSnapshot().portraitState;
    const due = (s: PortraitState | undefined) => !s || (s.status === 'failed' && ((s.down && back) || turns(host.adv) - s.turn >= PORTRAIT_RETRY_TURNS));
    const next = host.adv.entities.find((e) => e.kind === 'character' && e.portraitId === undefined && !tried.has(e.id) && due(state[e.id]));
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
    width: s.portraitSize,
    height: s.portraitSize,
    steps: s.portraitSteps,
    cfgScale: s.cfgScale,
    seed: seedOf(e.id),
    model: s.model,
    sampler: s.sampler,
    clipSkip: s.clipSkip,
    // No hires pass: the picture is kept at 64 px, so a second render would buy nothing.
  };
  const provider = await pending;
  const ms = host.svc.imageTimeoutMs;
  setState(host, id, { status: 'queued' });
  try {
    const blob = await imageQueue.enqueue('portrait', () => {
      setState(host, id, { status: 'rendering' });
      return trackJob('image', () => provider.txt2img(req, AbortSignal.timeout(ms)));
    });
    setState(host, id, undefined);
    if (find(host, id)?.portraitId !== e.portraitId) return;
    await setPortrait(host, id, await downscale(blob, PORTRAIT_PX));
  } catch (err) {
    setState(host, id, { status: 'failed', error: imageFailure(err, ms), turn: turns(host.adv), down: !(await provider.health()) });
    throw err;
  }
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
