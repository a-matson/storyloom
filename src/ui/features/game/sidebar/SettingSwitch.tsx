import { Switch } from '@ui/components/ui/switch';
import { describedBy, Setting } from './Section';

interface Props {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  help?: string;
}

export function SettingSwitch({ id, label, checked, onChange, help }: Props) {
  return (
    <Setting label={label} htmlFor={id} help={help}>
      <Switch id={id} checked={checked} onChange={onChange} aria-describedby={describedBy(id, help)} />
    </Setting>
  );
}
