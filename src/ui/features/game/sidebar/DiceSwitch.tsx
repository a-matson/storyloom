import { hasScripts, type Adventure } from '@core/model';
import { DICE_SCRIPTS, isCurrentDice, isDiceScripts } from '@core/dice';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Select } from '@ui/components/ui/field';
import { describedBy, Section, Setting } from './Section';
import { SettingSwitch } from './SettingSwitch';

const LEVELS = ['harsh', 'fair', 'none'] as const;
const LABELS = { harsh: 'Harsh', fair: 'Fair', none: 'None' };
const LEVEL_HELP = 'Harsh: every roll needs 3 more · Fair: the plain bands · None: you never fail badly';

/** Copies the bundled dice script on or off; never overwrites scripts the player brought. */
export function DiceSwitch({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const on = isDiceScripts(adventure.scripts);
  const other = !on && hasScripts(adventure.scripts);
  return (
    <Section title="Consequences">
      <SettingSwitch
        id="dice"
        label="Dice outcomes"
        help={
          other
            ? 'Off: this story has its own scripts, and the dice script would replace them'
            : 'Each Do turn rolls a d20 against a difficulty and tells the model whether you succeed, succeed at a cost or fail badly'
        }
        checked={on}
        disabled={other}
        onChange={(v) => api.setScripts(v ? DICE_SCRIPTS : undefined)}
      />
      {isCurrentDice(adventure.scripts) && (
        <Setting label="Consequences" htmlFor="consequences" help={LEVEL_HELP}>
          <Select
            id="consequences"
            className="w-auto"
            value={adventure.settings.consequences}
            aria-describedby={describedBy('consequences', LEVEL_HELP)}
            onChange={(e) => {
              const consequences = LEVELS.find((l) => l === e.target.value);
              if (consequences) api.updateSettings({ consequences });
            }}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LABELS[l]}
              </option>
            ))}
          </Select>
        </Setting>
      )}
    </Section>
  );
}
