import type { Scenario } from '@core/model';

// Own module so the library grid can label types without loading the editor.
export const SCENARIO_TYPES: { id: Scenario['type']; label: string }[] = [
  { id: 'story', label: 'Story' },
  { id: 'characterCreator', label: 'Character creator' },
  { id: 'multipleChoice', label: 'Multiple choice' },
];
