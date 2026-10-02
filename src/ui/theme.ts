import type { AppSettings } from '@core/model';

export function applyTheme(s: AppSettings, textStyle: 'print' | 'clean' | 'hacker' = 'print'): void {
  const root = document.documentElement;
  root.dataset['theme'] = s.theme;
  root.dataset['contrast'] = s.highContrast ? 'high' : 'normal';
  root.dataset['textSize'] = s.textSize;
  root.dataset['textStyle'] = textStyle;
}
