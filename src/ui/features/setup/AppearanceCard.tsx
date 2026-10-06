import type { AppSettings } from '@core/model';
import { useSpeech, useVoices } from '@ui/hooks/useSpeech';
import { Card } from '@ui/components/ui/card';
import { Select } from '@ui/components/ui/field';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Switch } from '@ui/components/ui/switch';
import { THEMES } from './backends';

interface Props {
  theme: AppSettings['theme'];
  onTheme: (theme: AppSettings['theme']) => void;
  speech: AppSettings['speech'];
  onSpeech: (speech: AppSettings['speech']) => void;
  speakerAvatars: boolean;
  onSpeakerAvatars: (on: boolean) => void;
}

const row = 'flex items-center gap-2.5 text-control';

function ReadAloud({ speech, onSpeech }: Pick<Props, 'speech' | 'onSpeech'>) {
  const voices = useVoices();
  return (
    <>
      <div className={row}>
        <label htmlFor="read-aloud" className="grow">
          Read aloud
        </label>
        <Switch id="read-aloud" checked={speech.enabled} onChange={(enabled) => onSpeech({ ...speech, enabled })} />
      </div>
      {speech.enabled && (
        <div className={row}>
          <label htmlFor="voice" className="grow">
            Voice
          </label>
          <Select
            id="voice"
            className="h-8 w-40"
            value={speech.voiceUri ?? ''}
            onChange={(e) => onSpeech({ ...speech, voiceUri: e.target.value === '' ? undefined : e.target.value })}
          >
            <option value="">System default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </>
  );
}

export function AppearanceCard({ theme, onTheme, speech, onSpeech, speakerAvatars, onSpeakerAvatars }: Props) {
  const { supported } = useSpeech();
  return (
    <Card className="flex flex-col gap-2">
      <SectionLabel>Appearance</SectionLabel>
      <div className={row}>
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
      <div className={row}>
        <label htmlFor="speaker-avatars" className="grow">
          Speaker portraits beside dialogue
        </label>
        <Switch id="speaker-avatars" checked={speakerAvatars} onChange={onSpeakerAvatars} />
      </div>
      {supported && <ReadAloud speech={speech} onSpeech={onSpeech} />}
    </Card>
  );
}
