import { useState } from 'react';
import { DEFAULT_ADVENTURE_SETTINGS, newId, type AdventureSettings, type AppSettings } from '@core/model';
import { imageRequest } from '@core/image';
import { trackJob } from '@core/trace';
import { downscale } from '@app/image';
import { imageQueue } from '@app/session/imageQueue';
import { imageProviderFor, storage } from '@app/services';
import { CoverThumb } from '@ui/components/CoverThumb';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { pickFile } from '@ui/transferUi';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Long side a cover is downscaled to; a ceiling on the stored blob, not a render cost. [provisional] */
const COVER_MAX_PX = 768;

interface Props {
  /** Adventure or scenario the cover blob is stored under. */
  ownerId: string;
  coverId: string | undefined;
  coverUrl?: string | undefined;
  app: AppSettings;
  /** txt2img parameters; the adventure's for a story, the defaults for a scenario. */
  image?: AdventureSettings['image'] | undefined;
  onChange: (coverId: string | undefined) => void;
}

/** Upload a picture or generate one for the library card. A new cover gets a new id, so the card refreshes. */
export function CoverPicker({ ownerId, coverId, coverUrl, app, image, onChange }: Props) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  // Every path downscales here, so a generated PNG is stored at the same ceiling as an upload.
  const store = async (blob: Blob) => {
    const id = newId('img_');
    await storage.putImage(ownerId, id, await downscale(blob, COVER_MAX_PX));
    onChange(id);
    if (coverId !== undefined) await storage.deleteImage(ownerId, coverId).catch((e: unknown) => console.warn('could not delete the old cover', e));
  };

  const upload = async () => {
    const file = await pickFile('image/*');
    if (file) await store(file);
  };

  const generate = async () => {
    const text = prompt.trim();
    if (text === '') throw new Error('Describe the cover first: a line of comma-separated visual tags.');
    const pending = imageProviderFor(app);
    if (!pending) throw new Error('No image server is configured; add one in Settings.');
    const provider = await pending;
    // Tracked like See mode: a cover generated mid-turn takes the GPU, so the turn's trace must see it.
    const blob = await imageQueue.enqueue('cover', () =>
      trackJob('image', () => provider.txt2img(imageRequest(image ?? DEFAULT_ADVENTURE_SETTINGS.image, text))),
    );
    await store(blob);
  };

  const remove = async () => {
    if (coverId === undefined) return;
    onChange(undefined);
    await storage.deleteImage(ownerId, coverId);
  };

  const run = (job: () => Promise<void>) => {
    setBusy(true);
    job()
      .catch((e: unknown) => alert(message(e)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Cover</SectionLabel>
      <div className="flex items-start gap-2">
        <CoverThumb ownerId={ownerId} coverId={coverId} coverUrl={coverUrl} className="h-15 w-30 shrink-0" />
        <div className="flex min-w-0 grow flex-col gap-2">
          <Input value={prompt} placeholder="lantern-lit tavern, rainy night, painted illustration" onChange={(e) => setPrompt(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button disabled={busy} onClick={() => run(generate)}>
              Generate
            </Button>
            <Button disabled={busy} onClick={() => run(upload)}>
              Upload…
            </Button>
            <span className="grow" />
            {coverId !== undefined && (
              <Button variant="ghost" danger disabled={busy} onClick={() => run(remove)}>
                remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
