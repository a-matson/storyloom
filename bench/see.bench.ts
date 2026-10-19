import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { A1111Provider } from '@adapters/providers/a1111';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { styleOf } from '@app/session/portraitPrompt';
import { familyOf } from '@core/image';
import { seePrompt } from '@core/image/autoPrompt';
import { composeSeePrompt, looksOf } from '@core/image/compose';
import { imageRequest } from '@core/image/request';
import { heldBy, indexAssertions, sceneNames, SHEET_KEYS, tagify, withLooks } from '@core/memory';
import { presentAt } from '@core/memory/secrets';
import { type Adventure, type Assertion, contentClause, type Entity } from '@core/model';
import * as S from '@core/schema';
import { OUT_DIR, writeMeasurement } from './env';
import labels from './seeLabels.json';
import { storeAt } from './storeAt';

// Every `see` of a backup through the current composer, with the store, scene and cast as they stood then.
// `pnpm measure see <backup> [image-url] [label]`; MEASURE_URL=<text server> asks the helper as the app does
// (story pose tags, and the line for a See with no brief), else a See with no brief composes its stored prompt.
// MEASURE_REBUILD=1 answers the builder again with every stored look first (M29-9's "rebuild first").
const { MEASURE_BACKUP: backup, MEASURE_IMAGES: imagesUrl, MEASURE_URL: url, MEASURE_REBUILD: rebuild } = process.env;
const LABEL = process.env['MEASURE_LABEL'] ?? 'baseline';
const FIELDS = ['bodyPlan', 'posture', 'action', 'view', 'scene'] as const;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (prompt: string, tag: string) => new RegExp(`(^|[^a-z])${esc(tag)}($|[^a-z])`, 'i').test(prompt);

test.skipIf(!backup)('see prompts over a backup', { timeout: 3_600_000 }, async () => {
  const parsed = S.Adventure.parse(JSON.parse(readFileSync(backup ?? '', 'utf8')).adventure);
  const adv = rebuild ? rebuilt(parsed) : parsed;
  const { image } = adv.settings;
  const family = familyOf(image.model, image.width, image.height);
  const helper = async () => ({
    provider: new LlamaServerProvider('see', url ?? ''),
    template: adv.settings.template,
    content: contentClause(adv.settings, 'record'),
  });
  // Proper nouns only, as the composer judges a location: "forest" is a place's name and a fine tag.
  const names = adv.entities.flatMap((e) => [e.name, ...(e.aliases ?? [])]).filter((n) => /\p{Lu}/u.test(n));
  const rows: (Row & Record<string, unknown> & { fused: boolean; properNoun: string[]; hits?: Record<string, boolean> | undefined })[] = [];
  for (const [at, a] of adv.actions.entries()) {
    if (a.type !== 'see' || !a.image) continue;
    const raw = a.image.brief === undefined;
    const ix = indexAssertions(storeAt(adv.assertions, at));
    // As in the app: the last state read covered the last story action and the player line before it.
    const from = adv.actions.slice(0, at).findLastIndex((x) => x.type !== 'see') - 1;
    const holds = (e: Entity) => (e.kind === 'character' ? heldBy(adv.entities, ix, e.name).map((i) => i.id) : []);
    const location = adv.plot.sceneLog?.findLast((s) => s.at < at)?.location;
    const scene = adv.plot.scene && { ...adv.plot.scene, ...(location !== undefined && { location }), present: presentAt(adv.plot.presence, at) };
    const req = {
      brief: a.image.brief ?? (url ? '' : a.image.prompt),
      actions: adv.actions.slice(0, at),
      plotEssentials: adv.plot.plotEssentials,
      scene: scene && sceneNames(scene, adv.entities),
      entities: adv.entities.map((e) => ({ ...withLooks(e, ix.of(e.id), from), holds: holds(e) })),
      style: styleOf(image, adv.tags),
      family,
      readsStory: true,
    };
    const { blocks, dropped, ...composed } = composeSeePrompt(req);
    const { prompt, seed } = url ? await seePrompt(req, helper) : composed;
    const sent = imageRequest(image, prompt).prompt;
    // A look tag (spelled `key: value` before M29, `value key` since) that runs on into the next words with no comma.
    const looks = req.entities.flatMap((e) => Object.entries(e.looks).flatMap(([k, v]) => [`${k}: ${v} `, `${v} ${k} `]));
    const fused = sent.split(', ').some((t) => looks.some((l) => t.startsWith(l)));
    const label = labels.sees.find((l) => l.adventure === adv.title && l.at === at);
    const hits = label && Object.fromEntries(FIELDS.map((f) => [f, label[f].some((t) => has(sent, t))]));
    rows.push({
      at,
      raw,
      brief: req.brief,
      prompt,
      sent,
      blocks,
      dropped,
      seed,
      fused,
      properNoun: names.filter((n) => has(sent, n)),
      chars: sent.length,
      hits,
    });
  }
  const score = Object.fromEntries(FIELDS.map((f) => [f, `${rows.filter((r) => r.hits?.[f]).length}/${rows.filter((r) => r.hits).length}`]));
  const name = `see-${adv.title.toLowerCase().split(/\W/)[0]}-${LABEL}`;
  const renders = imagesUrl ? await render(name, rows, (prompt, seed) => ({ ...imageRequest(image, prompt), ...(seed !== undefined && { seed }) })) : undefined;
  console.log(
    score,
    `fused ${rows.filter((r) => r.fused).length}/${rows.length}`,
    `proper nouns ${rows.filter((r) => r.properNoun.length).length}/${rows.length}`,
  );
  console.log(writeMeasurement(name, { backup, url, imagesUrl, labelledBy: labels.labelledBy, score, rows, renders }));
});

type Row = { at: number; prompt: string; sent: string; seed?: number | undefined };

const SHEET_PART = new RegExp(`(?:^|,\\s*)(${SHEET_KEYS.join('|')}):\\s*`);
/** Every look answered again through the builder, and every frozen look frozen again from them (as a new reference does). */
function rebuilt(adv: Adventure): Adventure {
  const assertions = adv.assertions.flatMap(tagified);
  const ix = indexAssertions(assertions);
  const entities = adv.entities.map((e) => (e.look === undefined ? e : { ...e, look: looksOf(withLooks(e, ix.of(e.id))) }));
  return { ...adv, assertions, entities };
}

/** A look as the builder now stores it: tagified, a legacy one split into its `key: value` parts (text before the first key dropped). */
function tagified(a: Assertion): Assertion[] {
  if (a.kind !== 'look') return [a];
  if (a.key !== 'legacy') return [{ ...a, value: tagify(a.value).join(', ') }];
  const parts = a.value.split(SHEET_PART).slice(1);
  const out: Assertion[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push({ ...a, id: `${a.id}_${i}`, key: parts[i] ?? '', value: tagify(parts[i + 1] ?? '').join(', ') });
  return out.length ? out : [a];
}

/** One render per See into `<OUT_DIR>/<date>-<name>/`, with an index.html contact sheet. */
async function render(name: string, rows: readonly Row[], request: (prompt: string, seed?: number) => ReturnType<typeof imageRequest>): Promise<string> {
  const dir = `${OUT_DIR}/${new Date().toISOString().slice(0, 10)}-${name}`;
  mkdirSync(dir, { recursive: true });
  const images = new A1111Provider('see', imagesUrl ?? '');
  const cells = [];
  for (const r of rows) {
    const png = await images.txt2img(request(r.prompt, r.seed), AbortSignal.timeout(900_000));
    writeFileSync(`${dir}/${r.at}.png`, Buffer.from(await png.arrayBuffer()));
    cells.push(`<figure><img src="${r.at}.png" width="384"><figcaption>#${r.at} ${r.sent.replace(/</g, '&lt;')}</figcaption></figure>`);
  }
  writeFileSync(
    `${dir}/index.html`,
    `<!doctype html><title>${name}</title><style>body{display:flex;flex-wrap:wrap;gap:1em;font:12px sans-serif}figure{width:384px}</style>${cells.join('')}`,
  );
  return dir;
}
