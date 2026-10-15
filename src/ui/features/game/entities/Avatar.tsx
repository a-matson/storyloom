import { hashPrompt } from '@core/trace';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { cn } from '@ui/lib/utils';

// The pill tones: already contrast-checked in both themes.
const TONES = ['bg-mode-do-bg text-mode-do', 'bg-mode-say-bg text-mode-say', 'bg-mode-story-bg text-mode-story', 'bg-mode-see-bg text-mode-see'];

interface Props {
  name: string;
  adventureId: string;
  portraitId?: string | undefined;
  size?: 'sm' | 'lg';
}

const SIZES = { sm: { px: 32, cls: 'size-8 rounded-full text-caption' }, lg: { px: 128, cls: 'size-32 rounded-lg text-title' } };

/** 32 px (`lg`: 128 px, the drawer): the stored portrait, else initials coloured by a hash of the name so an entity keeps its colour across sessions. */
export function Avatar({ name, adventureId, portraitId, size = 'sm' }: Props) {
  const { px, cls } = SIZES[size];
  const url = useImageBlob(adventureId, portraitId);
  if (url !== undefined) return <img src={url} alt="" width={px} height={px} className={cn('shrink-0 object-cover', cls)} />;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const tone = TONES[Number.parseInt(hashPrompt(name).slice(-6), 16) % TONES.length];
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center font-sans font-semibold', cls, tone)}>
      {initials}
    </span>
  );
}
