import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { A1111Provider } from '@adapters/providers/a1111';
import { sheetRequest } from '@app/session/builder';
import { composeSeePrompt, looksOf } from '@core/image/compose';
import { imageRequest } from '@core/image/request';
import { withLooks } from '@core/memory';
import { benchAdventure } from './characters';
import { writeMeasurement } from './env';

/**
 * M16-4's bar: after Done, two Sees of each of five characters on the frozen look and the portrait seed
 * (text only), then the same Sees as img2img from the sheet's front view (its left quarter, ImageMagick)
 * at MEASURE_DENOISE. Sees are 512x768 at MEASURE_STEPS; the sheet is the quick
 * round one (12 steps, no hires): only the crop uses it, and img2img redraws it anyway.
 */
const { MEASURE_IMAGES, MEASURE_LABEL, MEASURE_DENOISE, MEASURE_STEPS } = process.env;
const url = MEASURE_IMAGES ?? 'http://127.0.0.1:7860';
const label = MEASURE_LABEL ?? 'run';
const out = `/tmp/reference-bar/${label}`;
const denoise = Number(MEASURE_DENOISE ?? 0.6);
const steps = Number(MEASURE_STEPS ?? 16);
const SUBJECTS: [string, number][] = [
  ['ria', 1],
  ['vex', 1],
  ['ria', 2],
  ['vex', 2],
  ['ria', 3],
];
const BRIEFS = ['{n} leans on a tavern bar', '{n} walks through a snowy forest'];

it('reference use', async () => {
  mkdirSync(out, { recursive: true });
  const images = new A1111Provider('bench', url);
  const save = async (file: string, png: Blob) => writeFileSync(`${out}/${file}`, Buffer.from(await png.arrayBuffer()));
  const signal = () => AbortSignal.timeout(900_000);
  const rows = [];
  for (const [name, n] of SUBJECTS) {
    const { adv, e, own } = benchAdventure(name, n);
    const sheet = `${name}-${n}-sheet.png`;
    const sheetReq = sheetRequest(adv, e.id, []);
    await save(sheet, await images.txt2img(sheetReq, signal()));
    const crop = `${sheetReq.width / 4}x${sheetReq.height}+0+0`;
    execFileSync('magick', [`${out}/${sheet}`, '-crop', crop, '+repage', `${out}/${name}-${n}-front.png`]);
    const init = new Blob([readFileSync(`${out}/${name}-${n}-front.png`)], { type: 'image/png' });
    const frozen = withLooks({ ...e, look: looksOf(withLooks(e, own)) }, own);
    for (const [i, brief] of BRIEFS.entries()) {
      const see = composeSeePrompt({ brief: brief.replace('{n}', name), entities: [frozen], style: '' });
      const req = { ...imageRequest(adv.settings.image, see.prompt), width: 512, height: 768, steps, ...(see.seed !== undefined && { seed: see.seed }) };
      let t = Date.now();
      await save(`${name}-${n}-see${i + 1}-text.png`, await images.txt2img(req, signal()));
      const textMs = Date.now() - t;
      t = Date.now();
      await save(`${name}-${n}-see${i + 1}-img2img.png`, await images.img2img({ ...req, init, denoise }, signal()));
      rows.push({ name, n, see: i + 1, prompt: see.prompt, seed: see.seed, textMs, img2imgMs: Date.now() - t });
      console.log(name, n, i + 1, textMs, Date.now() - t);
    }
  }
  console.log(writeMeasurement(`reference-bar-${label}`, { model: (await images.models())[0], out, denoise, steps, rows }));
}, 7_200_000);
