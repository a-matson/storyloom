import type { SectionKind } from '@core/context';

/** One colour per context section, shared by the top-bar meter and the context viewer. */
export const SECTION_BG: Record<SectionKind, string> = {
  instructions: 'bg-lantern',
  plotEssentials: 'bg-lantern-soft',
  storySummary: 'bg-success',
  history: 'bg-neutral',
  storyCards: 'bg-violet',
  memories: 'bg-verdigris',
  authorsNote: 'bg-rose',
  retryNote: 'bg-rose',
  rules: 'bg-rose',
  scene: 'bg-warning',
  cast: 'bg-warning',
  lastAction: 'bg-foreground',
  frontMemory: 'bg-muted-foreground',
  script: 'bg-muted-foreground',
};

export const SECTION_LABEL: Record<SectionKind, string> = {
  instructions: 'AI Instructions',
  plotEssentials: 'Plot Essentials',
  storySummary: 'Story Summary',
  history: 'History',
  storyCards: 'Story cards',
  memories: 'Memories',
  authorsNote: "Author's Note",
  retryNote: 'Retry note',
  rules: 'Rules',
  scene: 'Scene',
  cast: 'Cast',
  lastAction: 'Last action',
  frontMemory: 'Front memory (script)',
  script: 'Inserted by a script',
};
