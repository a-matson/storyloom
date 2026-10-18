import { describe, expect, it } from 'vitest';
import { composeSeePrompt } from '@core/image/compose';
import { frameOf } from '@core/image/framing';
import type { Entity } from '@core/model';

type Char = Entity & { looks?: Record<string, string>; states?: Record<string, string>; holds?: string[] };
const imperium: Char = {
  id: 'i',
  kind: 'character',
  name: 'Imperium',
  aliases: [],
  description: 'Imperium is a dragon empress.',
  looks: { species: 'dragon', skin: 'violet', eyes: 'amber', horns: 'curved', wearing: 'silk robe', claws: 'black' },
  states: { posture: 'sitting', mood: 'smug' },
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
};
const see = (brief: string) => composeSeePrompt({ brief, entities: [imperium], style: '', family: 'sdxl' });

describe('frameOf', () => {
  it('reads each row, the first match winning', () => {
    expect(frameOf("Imperium's feet up close, only feet")).toMatchObject({ tag: 'feet only', brief: "Imperium's feet, feet" });
    expect(frameOf('her paws, close-up')?.tag).toBe('foot focus');
    expect(frameOf('a portrait of Imperium')?.tag).toBe('portrait');
    expect(frameOf('her face up close')).toMatchObject({ tag: 'portrait', brief: 'her face' });
    expect(frameOf('his groin')?.tag).toBe('close-up, lower body');
    expect(frameOf('the lantern up close')).toMatchObject({ tag: 'close-up', keys: 'all', brief: 'the lantern' });
  });

  it('no framing word is no frame', () => {
    expect(frameOf('Imperium on the throne')).toBeUndefined();
  });
});

describe('composeSeePrompt framing', () => {
  it('puts the framing tag first', () => {
    expect(see("Imperium's feet up close, only feet").prompt).toMatch(/^feet only, solo, /);
  });

  it('a feet frame sends species and skin colours, not eyes or wearing', () => {
    const { blocks } = see("Imperium's feet up close, only feet");
    expect(blocks.subject).toBe('feet only, solo, dragon, violet skin, black claws');
    expect(blocks.state).toBe('');
  });

  it('a face frame keeps mood, drops posture', () => {
    const { blocks } = see('a portrait of Imperium');
    expect(blocks.subject).toBe('portrait, solo, dragon, amber eyes, curved horns');
    expect(blocks.state).toBe('smug expression');
  });

  it('close-up keeps every key', () => {
    const { blocks } = see('Imperium up close');
    expect(blocks.subject).toBe('close-up, solo, dragon, violet skin, amber eyes, curved horns, wearing silk robe, black claws');
    expect(blocks.state).toBe('sitting, smug expression');
  });
});
