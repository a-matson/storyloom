import type { AppSettings } from '@core/model';
import type { Accent } from '@ui/lib/dominantColour';

const ACCENT_VARS = ['--lantern', '--lantern-soft', '--lantern-ink'];

export function applyTheme(s: AppSettings, textStyle: 'print' | 'clean' | 'hacker' = 'print', accent?: Accent): void {
  const root = document.documentElement;
  root.dataset['theme'] = s.theme;
  root.dataset['contrast'] = s.highContrast ? 'high' : 'normal';
  root.dataset['textSize'] = s.textSize;
  root.dataset['textStyle'] = textStyle;
  // 'dynamic' has no token block: it is the dark theme with the cover's accent on top,
  // so with no cover (or outside an adventure) it simply stays dark.
  if (s.theme === 'dynamic' && accent) {
    root.style.setProperty('--lantern', `hsl(${accent.h} ${accent.s}% ${accent.l}%)`);
    root.style.setProperty('--lantern-soft', `hsl(${accent.h} ${accent.s}% ${Math.min(90, accent.l + 14)}%)`);
    root.style.setProperty('--lantern-ink', `hsl(${accent.h} 40% 7%)`);
  } else {
    for (const v of ACCENT_VARS) root.style.removeProperty(v);
  }
}
