import { Switch } from '@ui/components/ui/switch';
import { Setting } from './Section';

interface Props {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  title?: string;
}

export function SettingSwitch({ id, label, checked, onChange, title }: Props) {
  return (
    <Setting label={label} htmlFor={id} {...(title === undefined ? {} : { title })}>
      <Switch id={id} checked={checked} onChange={onChange} />
    </Setting>
  );
}
