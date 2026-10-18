import { useState } from 'react';
import { secretEdits } from '@app/session/secret';
import { defaultKnownBy, YOU } from '@core/memory';
import type { Action } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Input } from '@ui/components/ui/field';
import { charactersOf, HiddenFrom, KnownBy } from './entities/SecretsList';

/** The first sentence of what the player wrote, as the gist to edit. */
const firstSentence = (display: string) => /^.*?[.!?](?=\s|$)/s.exec(display)?.[0] ?? display;

interface Props {
  action: Action;
  display: string;
  api: GameApi;
  /** The session ignores edits while a turn runs. */
  busy: boolean;
  onClose: () => void;
}

/** Opened from a Do/Say's pill: a gist and who knows it (you and whoever was there), saved to the World tab's Secrets. */
export function MarkSecret({ action, display, api, busy, onClose }: Props) {
  // Read once on open: the form is short-lived, and the cast and presence do not change while the player types.
  const [draft, setDraft] = useState(() => {
    const { adventure, actions } = api.getSnapshot();
    const at = actions.findIndex((a) => a.id === action.id);
    return { text: firstSentence(display), knownBy: defaultKnownBy(adventure.plot, at).filter((k) => k !== YOU), cast: charactersOf(adventure) };
  });
  return (
    <form
      className="mt-1.5 flex flex-col gap-1.5 font-sans"
      aria-label="Mark secret"
      onSubmit={(e) => {
        e.preventDefault();
        secretEdits(api).markSecret(action.id, draft.text, draft.knownBy);
        onClose();
      }}
    >
      <Input className="h-8 text-caption" aria-label="Secret" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      <KnownBy cast={draft.cast} knownBy={draft.knownBy} label="Who knows" onChange={(knownBy) => setDraft({ ...draft, knownBy })} />
      <HiddenFrom cast={draft.cast} knownBy={draft.knownBy} />
      <span className="flex gap-1.5">
        <Button type="submit" className="h-7 px-2.5 text-caption" disabled={busy || !draft.text.trim()}>
          Save secret
        </Button>
        <Button variant="ghost" className="h-7 px-2.5 text-caption" onClick={onClose}>
          Cancel
        </Button>
      </span>
    </form>
  );
}
