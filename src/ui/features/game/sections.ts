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
  scene: 'bg-warning',
  facts: 'bg-warning',
  entityCards: 'bg-violet',
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
  scene: 'Scene',
  facts: 'Established facts',
  entityCards: 'Entity cards',
  lastAction: 'Last action',
  frontMemory: 'Front memory (script)',
  script: 'Inserted by a script',
};
