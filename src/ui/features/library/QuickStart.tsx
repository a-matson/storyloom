import { useState } from 'react';
import { QUICK_STARTS } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { SectionLabel } from '@ui/components/ui/section-label';
import { Textarea } from '@ui/components/ui/textarea';

interface Props {
  onStart: (title: string, opening: string) => void;
  /** Absent while the backend is down. Resolves when the adventure is open or the error shown. */
  onSurprise?: (() => Promise<void>) | undefined;
}

export function QuickStart({ onStart, onSurprise }: Props) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [writing, setWriting] = useState(false);
  const surprise = () => {
    if (!onSurprise) return;
    setWriting(true);
    void onSurprise().finally(() => setWriting(false));
  };
  return (
    <div className="flex w-80 shrink-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <SectionLabel>Quick start</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_STARTS.map((q) => (
          <Button key={q.tag} className="h-10" onClick={() => onStart(q.title, q.opening)}>
            {q.title}
          </Button>
        ))}
      </div>
      <Button variant="ghost" className="border-dashed text-lantern" disabled={!onSurprise || writing} onClick={surprise}>
        {writing ? 'Writing…' : 'Surprise me'}
      </Button>
      <Button variant="ghost" className="border-dashed text-lantern" onClick={() => setShowCustom((s) => !s)}>
        Write your own opening
      </Button>
      {showCustom && (
        <>
          <Textarea value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="You are…" />
          <Button variant="primary" disabled={!custom.trim()} onClick={() => onStart('New adventure', custom.trim())}>
            Begin
          </Button>
        </>
      )}
    </div>
  );
}
