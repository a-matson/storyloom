import type { AppSettings } from '@core/model';
import { Card } from '@ui/components/ui/card';
import { Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { THEMES } from './backends';

interface Props {
  theme: AppSettings['theme'];
  onTheme: (theme: AppSettings['theme']) => void;
}

export function AppearanceCard({ theme, onTheme }: Props) {
  return (
    <Card className="flex flex-col gap-2">
      <SectionLabel>Appearance</SectionLabel>
      <div className="flex items-center gap-2.5 text-control">
        <label htmlFor="theme" className="grow">
          Theme
        </label>
        <Select
          id="theme"
          className="h-8 w-40"
          value={theme}
          onChange={(e) => {
            const picked = THEMES.find((t) => t.value === e.target.value);
            if (picked) onTheme(picked.value);
          }}
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
    </Card>
  );
}
