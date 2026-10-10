import { hashPrompt } from '@core/trace';
import { useImageBlob } from '@ui/hooks/useImageBlob';
import { cn } from '@ui/lib/utils';

// The pill tones: already contrast-checked in both themes.
const TONES = ['bg-mode-do-bg text-mode-do', 'bg-mode-say-bg text-mode-say', 'bg-mode-story-bg text-mode-story', 'bg-mode-see-bg text-mode-see'];

interface Props {
  name: string;
  adventureId: string;
  portraitId?: string | undefined;
}

const SIZE = 'size-8 text-caption';

/** 32 px everywhere: the stored portrait, else initials coloured by a hash of the name so an entity keeps its colour across sessions. */
export function Avatar({ name, adventureId, portraitId }: Props) {
  const url = useImageBlob(adventureId, portraitId);
  if (url !== undefined) return <img src={url} alt="" width={32} height={32} className={cn('shrink-0 rounded-full object-cover', SIZE)} />;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const tone = TONES[Number.parseInt(hashPrompt(name).slice(-6), 16) % TONES.length];
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-sans font-semibold', SIZE, tone)}>
      {initials}
    </span>
  );
}
