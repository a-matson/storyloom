/** Pill tone for a card type, shared by the game's cards tab and the scenario rail. */
export const tone = (type: string) => (type.toLowerCase() === 'character' ? 'do' : type.toLowerCase() === 'location' ? 'say' : 'plain');
