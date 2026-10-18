import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { A1111Provider } from '@adapters/providers/a1111';
import { sheetRequest } from '@app/session/builder';
import { sheetPrompt } from '@core/image/sheet';
import { benchAdventure, CHARS } from './characters';
import { writeMeasurement } from './env';

/**
 * M16-3's bar: round sheets of two characters, five entity ids each (so five portrait seeds), on the
 * server's loaded checkpoint. PNGs go to MEASURE_OUT for a contact sheet; the JSON keeps every prompt.
 * MEASURE_WEIGHT overrides the family's weight; MEASURE_SIZE=w,h stands in for the See size (family by size);
 * MEASURE_ONLY=<name> draws one character.
 */
const { MEASURE_IMAGES, MEASURE_LABEL, MEASURE_OUT, MEASURE_WEIGHT, MEASURE_SIZE, MEASURE_ONLY: only, MEASURE_CLIP } = process.env;
const url = MEASURE_IMAGES ?? 'http://127.0.0.1:7860';
const label = MEASURE_LABEL ?? 'run';
const out = MEASURE_OUT ?? `/tmp/sheet-bar/${label}`;
const weight = MEASURE_WEIGHT === undefined ? undefined : Number(MEASURE_WEIGHT);
const [width = 512, height = 512] = (MEASURE_SIZE ?? '512,512').split(',').map(Number);
const clipSkip = MEASURE_CLIP === undefined ? undefined : Number(MEASURE_CLIP);

it('round sheets', async () => {
  mkdirSync(out, { recursive: true });
  const images = new A1111Provider('bench', url);
  const rows = [];
  for (const name of Object.keys(CHARS).filter((n) => !only || n === only))
    for (const n of [1, 2, 3, 4, 5]) {
      const { adv, e, own } = benchAdventure(name, n);
      adv.settings.image = { ...adv.settings.image, width, height, ...(clipSkip !== undefined && { clipSkip }) };
      const base = sheetRequest(adv, e.id, []);
      const req = weight === undefined ? base : { ...base, prompt: sheetPrompt(own, [], weight) };
      const t = Date.now();
      const png = await images.txt2img(req, AbortSignal.timeout(600_000));
      writeFileSync(`${out}/${name}-${n}.png`, Buffer.from(await png.arrayBuffer()));
      rows.push({ name, n, ms: Date.now() - t, req });
      console.log(name, n, Date.now() - t);
    }
  console.log(writeMeasurement(`sheet-bar-${label}`, { model: (await images.models())[0], out, weight: weight ?? 'family default', rows }));
  // Ten renders at ~80-120 s each outrun the bench config's 10 minutes.
}, 3_600_000);
