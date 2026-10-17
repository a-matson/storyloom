import { hasScripts, type Adventure } from '@core/model';
import { DICE_SCRIPTS, isDiceScripts } from '@core/dice';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Section } from './Section';
import { SettingSwitch } from './SettingSwitch';

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
    </Section>
  );
}
