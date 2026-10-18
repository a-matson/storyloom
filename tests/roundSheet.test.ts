import { describe, expect, it } from 'vitest';
import { closeSheets, roundSheet } from '@app/session/builder';
import { lineEdits } from '@app/session/lines';
import { familyOf, sheetPrompt } from '@core/image/sheet';
import { mergeEntity } from '@core/memory/entities';
import { setValue } from '@core/memory/looks';
import { createBlankAdventure, type Assertion } from '@core/model';
import type { ImageRequest } from '@core/ports';
import { seedOf } from '@core/trace';
import { fakeImages } from './fixtures/images';
import { setup } from './fixtures/session';

const fox = mergeEntity(undefined, { name: 'Vex', kind: 'character', description: 'A fox smuggler named Vex.' }, 0);
const answered = (values: Record<string, string>): Assertion[] => Object.entries(values).reduce<Assertion[]>((own, [k, v]) => setValue(fox, own, k, v, 1), []);
const FRAME = 'character reference sheet, multiple views, front view, side view, back view, full body, white background';

describe('sheetPrompt', () => {
  it('is the frame and the stated keys, clothing first; a skipped or missing key adds nothing', () => {
    const own = answered({ species: 'fox anthro', hair: 'white mohawk', eyes: 'amber eyes', wearing: 'black jacket, red scarf', marks: 'a scar' });
    expect(sheetPrompt(own, ['marks'])).toBe(`${FRAME}, wearing: black jacket, red scarf, species: fox anthro, hair: white mohawk, amber eyes`);
    expect(sheetPrompt([], [])).toBe(FRAME);
  });

  it('weights clothing, hair and species together, and strips brackets a player typed', () => {
    const own = answered({ species: 'fox', hair: 'white (spiky) mohawk', eyes: 'amber' });
    expect(sheetPrompt(own, [], 1.2)).toBe(`${FRAME}, (species: fox:1.2), (hair: white spiky mohawk:1.2), eyes: amber`);
  });

  it('fits the budget by dropping optional keys from the end, never clothing, species, hair or eyes', () => {
    const long = 'x'.repeat(30);
    const own = answered(
      Object.fromEntries(['species', 'build', 'skin', 'eyes', 'hair', 'face', 'wearing', 'marks', 'accessories', 'palette'].map((k) => [k, long])),
    );
    const p = sheetPrompt(own, [], 1.2);
    expect(p.length).toBeLessThanOrEqual(300);
    for (const k of ['wearing', 'species', 'hair', 'eyes']) expect(p).toContain(`${k}: `);
    expect(p).not.toContain('palette');
    expect(p).not.toMatch(/Vex|smuggler/);
  });

  it('tells SDXL from SD 1.5 by the checkpoint name, else the See size', () => {
    expect(familyOf('indigoVoidFurryFusedXL_noobaiV24', 512, 512)).toBe('sdxl');
    expect(familyOf(undefined, 1024, 1024)).toBe('sdxl');
    expect(familyOf('DreamShaper_8', 512, 768)).toBe('sd15');
  });
});

describe('roundSheet', () => {
  const withImages = () => {
    const adv = createBlankAdventure('Test', 'You stand at the gate.');
    adv.entities = [fox];
    adv.settings.image = { ...adv.settings.image, hires: true, clipSkip: 2 };
    const calls: ImageRequest[] = [];
    const s = setup({ adventure: adv, images: fakeImages(async (req) => (calls.push(req), new Blob([`png${calls.length}`]))) });
    return { ...s, calls };
  };

  it('draws a quick sheet on the portrait seed with no name, and a new round replaces the last one', async () => {
    const { session, images, calls } = withImages();
    lineEdits(session).setValue(fox.id, 'hair', 'white mohawk');
    const first = await roundSheet(session, fox.id, []);
    expect(calls[0]).toMatchObject({ steps: 12, width: 768, height: 384, seed: seedOf(fox.id), clipSkip: 2 });
    expect(calls[0]?.hires).toBeUndefined();
    expect(calls[0]?.prompt).toContain('white mohawk');
    expect(calls[0]?.prompt).not.toContain('Vex');
    const second = await roundSheet(session, fox.id, []);
    expect(second?.imageId).not.toBe(first?.imageId);
    expect([...images.keys()]).toEqual([`${session.adv.id}|${second?.imageId}`]);
  });

  it('leaves no blob after close, even from a render that lands after it', async () => {
    const { session, images } = withImages();
    await roundSheet(session, fox.id, []);
    const late = roundSheet(session, fox.id, []);
    closeSheets(session, fox.id);
    expect(await late).toBeUndefined();
    expect(images.size).toBe(0);
  });
});
