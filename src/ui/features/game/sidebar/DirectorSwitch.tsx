import { useSyncExternalStore } from 'react';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Select } from '@ui/components/ui/field';
import { describedBy, Section, Setting } from './Section';

/** Player turns between director turns. [provisional] */
const EVERY = [3, 4, 6];
const HELP =
  'After every few of your turns, a character beat or a complication plays on its own, labelled director; × erases it. Off when the story is reopened.';

/** The director: a cued Continue after every N player turns. Session-only (no setting is stored). */
export function DirectorSwitch({ api }: { api: GameApi }) {
  // Session state, not an adventure setting, so it is read from the store.
  const { director } = useSyncExternalStore(api.subscribe, api.getSnapshot);
  return (
    <Section title="Director">
      <Setting label="Director turns" htmlFor="director" help={HELP}>
        <Select
          id="director"
          className="w-auto"
          value={director ?? 'off'}
          aria-describedby={describedBy('director', HELP)}
          onChange={(e) => api.setDirector(EVERY.find((n) => String(n) === e.target.value) ?? null)}
        >
          <option value="off">Off</option>
          {EVERY.map((n) => (
            <option key={n} value={n}>
              Every {n} turns
            </option>
          ))}
        </Select>
      </Setting>
    </Section>
  );
}
