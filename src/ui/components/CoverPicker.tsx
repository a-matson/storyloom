import { useState } from 'react';
import { DEFAULT_ADVENTURE_SETTINGS, newId, type AdventureSettings, type AppSettings } from '@core/model';
import { imageProviderFor, storage } from '@app/services';
import { CoverThumb } from '@ui/components/CoverThumb';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { downscale } from '@ui/lib/image';
import { pickFile } from '@ui/transferUi';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Same long side as the See default image size. [provisional] */
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

  const store = async (blob: Blob) => {
    const id = newId('img_');
    await storage.putImage(ownerId, id, blob);
    onChange(id);
    if (coverId !== undefined) await storage.deleteImage(ownerId, coverId).catch((e: unknown) => console.warn('could not delete the old cover', e));
  };

  const upload = async () => {
    const file = await pickFile('image/*');
    if (file) await store(await downscale(file, COVER_MAX_PX));
  };

  const generate = async () => {
    const text = prompt.trim();
    if (text === '') throw new Error('Describe the cover first: a line of comma-separated visual tags.');
    const pending = imageProviderFor(app);
    if (!pending) throw new Error('No image server is configured; add one in Settings.');
    const provider = await pending;
    await store(await provider.txt2img({ ...(image ?? DEFAULT_ADVENTURE_SETTINGS.image), prompt: text }));
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
