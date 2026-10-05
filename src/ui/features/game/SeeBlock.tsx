import { useEffect, useRef, useState } from 'react';
import type { Action } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { Button, buttonClass } from '@ui/components/ui/button';
import { cn } from '@ui/lib/utils';
import { revealOnHover, seeIndent } from './OutputTools';

type Image = NonNullable<Action['image']>;
interface Props {
  action: Action;
  image: Image;
  adventureId: string;
  isLast: boolean;
  busy: boolean;
  /** A txt2img for this action is running right now. */
  generating: boolean;
  api: GameApi;
}

const tool = 'h-7 bg-transparent px-2.5 text-caption';
const fileName = (prompt: string) =>
  `${
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)
      .replace(/^-|-$/g, '') || 'image'
  }.png`;
/** Sharing files needs a target app; desktop Chrome has none, so the button is hidden there. */
const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

async function share(src: string, prompt: string): Promise<void> {
  // The object URL is fetchable, so the blob needs no second trip to IndexedDB.
  const file = new File([await (await fetch(src)).blob()], fileName(prompt), { type: 'image/png' });
  if (!navigator.canShare({ files: [file] })) return;
  await navigator.share({ files: [file] });
}

/**
 * The waiting state, with its seconds. A real 512²/24-step render takes **two minutes**
 * [measured: docs/measurements/2026-10-05-play-images.json], so a bare "Generating…" reads as broken.
 * Mounted only while the wait lasts, so its own state is the count and a Retry starts over.
 */
function Generating() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
    };
  }, []);
  // ponytail: counts ticks, not wall time, so a backgrounded tab under-counts; Date.now is impure in render.
  return <div className="font-sans text-caption text-muted-foreground">Generating… {s} s</div>;
}

/** Under the last image: share, download, retry and delete. Editing the prompt is on the caption. */
function ImageTools({ id, prompt, src, api }: { id: string; prompt: string; src: string | undefined; api: GameApi }) {
  const onShare = () =>
    void share(src ?? '', prompt).catch((e: unknown) => {
      // A dismissed share sheet rejects; nothing went wrong.
      if (!(e instanceof Error) || e.name !== 'AbortError') console.warn('could not share the image', e);
    });
  return (
    <div className={cn('mt-1.5 flex items-center gap-2 font-sans text-caption text-muted-foreground', revealOnHover)}>
      {src !== undefined && canShareFiles && (
        <Button className={tool} onClick={onShare}>
          Share
        </Button>
      )}
      {src !== undefined && (
        <a href={src} download={fileName(prompt)} className={buttonClass({}, tool)}>
          Download
        </a>
      )}
      <Button className={tool} onClick={() => api.regenerateSee(id)}>
        Retry
      </Button>
      <Button className={tool} danger onClick={() => api.eraseTo(id)}>
        Delete
      </Button>
    </div>
  );
}

/** A See-mode action: the caption shows while the image is still generating; double-click it to change the prompt. */
export function SeeBlock({ action, image, adventureId, isLast, busy, generating, api }: Props) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const blobUrl = useImageBlob(adventureId, image.imageId);
  // `url` only comes from imported AI Dungeon data; ours are blobs.
  const src = image.url ?? blobUrl;

  const commit = () => {
    setEditing(false);
    const next = ref.current?.innerText ?? image.prompt;
    if (next.trim() !== image.prompt) api.regenerateSee(action.id, next);
  };

  return (
    // No kind label of its own, so the empty gutter is padding rather than a grid cell — same token, same left edge as the prose.
    <figure className={cn('group m-0', seeIndent)}>
      {src !== undefined ? (
        <img src={src} alt={image.prompt} className="max-w-full rounded-lg" />
      ) : image.missing === true ? (
        <div className="font-sans text-caption text-muted-foreground">Image not exported</div>
      ) : image.imageId !== undefined ? null : generating ? ( // the blob is on disk and loading: a reload must not claim it is still generating
        // No skeleton box: a placeholder with its own size would not fit the start-up CSS budget.
        <Generating />
      ) : (
        // No job behind this prompt — the server failed, or a reload abandoned the request.
        <div className="font-sans text-caption text-danger">
          Could not generate this image
          <Button className={tool} onClick={() => api.regenerateSee(action.id)}>
            Retry
          </Button>
        </div>
      )}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- pointer shortcut; Retry regenerates without editing */}
      <figcaption
        ref={ref}
        className={cn('font-sans text-caption text-muted-foreground', editing && 'rounded-[4px] outline-1 outline-offset-4 outline-lantern outline-dashed')}
        contentEditable={editing}
        suppressContentEditableWarning
        onDoubleClick={() => !busy && setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          setEditing(false);
          if (ref.current) ref.current.innerText = image.prompt;
        }}
        title={editing ? 'Editing — click outside to generate a new image' : 'Double-click to edit the prompt'}
      >
        {image.prompt}
      </figcaption>
      {isLast && !busy && <ImageTools id={action.id} prompt={image.prompt} src={src} api={api} />}
    </figure>
  );
}
