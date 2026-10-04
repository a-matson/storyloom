import { useImageBlob } from '@ui/hooks/useImageBlob';
import { cn } from '@ui/lib/utils';

interface Props {
  /** Adventure or scenario the cover blob is stored under. */
  ownerId: string;
  coverId: string | undefined;
  /** Legacy cover from imported data, used when there is no blob. */
  coverUrl?: string | undefined;
  className?: string;
}

/**
 * The cover, or the plain placeholder block when there is none. The image is a background rather
 * than an `<img>`, set inline: it crops to the card without a single new Tailwind utility
 * (the start-up CSS budget has no room left).
 */
export function CoverThumb({ ownerId, coverId, coverUrl, className }: Props) {
  const blobUrl = useImageBlob(ownerId, coverId);
  const src = blobUrl ?? coverUrl;
  return (
    <div
      className={cn('rounded-md bg-secondary', className)}
      style={src === undefined ? undefined : { backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    />
  );
}
