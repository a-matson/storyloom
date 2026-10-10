import { useSyncExternalStore } from 'react';
import { getImageProgress, subscribeImageProgress, type ImageProgressView } from '@app/session/imageProgress';
import type { ImageJobKind } from '@app/session/imageQueue';

/** The running render's progress when it is a `kind` job; `undefined` falls back to the elapsed counter. */
export function useImageProgress(kind: ImageJobKind): ImageProgressView | undefined {
  const p = useSyncExternalStore(subscribeImageProgress, getImageProgress);
  return p?.kind === kind ? p : undefined;
}

/** "pass 2 of 2 · step 10/40 · ~57 s left" */
export const progressText = (p: ImageProgressView): string =>
  [p.pass && `pass ${p.pass} of 2`, `step ${p.step}/${p.steps}`, p.etaSeconds !== undefined && `~${p.etaSeconds} s left`].filter(Boolean).join(' · ');
