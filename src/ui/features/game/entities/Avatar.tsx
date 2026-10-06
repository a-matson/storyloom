import { hashPrompt } from '@core/trace';
import { cn } from '@ui/lib/utils';

// The pill tones: already contrast-checked in both themes.
const TONES = ['bg-mode-do-bg text-mode-do', 'bg-mode-say-bg text-mode-say', 'bg-mode-story-bg text-mode-story', 'bg-mode-see-bg text-mode-see'];

/** Initials coloured by a hash of the name, so an entity keeps its colour across sessions. Portraits come later. */
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const tone = TONES[Number.parseInt(hashPrompt(name).slice(-6), 16) % TONES.length];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-sans font-semibold',
        large ? 'size-16 text-card-title' : 'size-8 text-caption',
        tone,
      )}
    >
      {initials}
    </span>
  );
}
