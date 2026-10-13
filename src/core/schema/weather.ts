// A leaf: the lazy turn-read schema imports it without pulling `adventure.ts` into its chunk.

/** The words the turn read may set as weather; an older save may hold free text. [provisional] */
export const WEATHERS = ['rain', 'storm', 'snow', 'fog', 'wind', 'clear', 'sun', 'cold', 'hot'] as const;
