import type { Adventure, Scenario } from '@core/model';
import type { ImportResult, PlayerLines, StoryImage } from '@app/transfer';

// Import/export is rare; load it (zip + AI Dungeon mapping) on demand.
const transfer = () => import('@app/transfer');

/** Browser helpers for download / file-picker based import-export. */

export function downloadText(filename: string, text: string | Uint8Array, mime = 'application/json'): void {
  // The copy narrows fflate's `ArrayBufferLike` to the `ArrayBuffer` a Blob takes.
  const blob = new Blob([typeof text === 'string' ? text : new Uint8Array(text)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(s: string, fallback = 'adventure'): string {
  return (
    s
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || fallback
  );
}

export async function downloadScenarioJson(s: Scenario): Promise<void> {
  downloadText(`${safeName(s.title, 'scenario')}.scenario.json`, (await transfer()).exportScenarioJson(s));
}

export async function importScenarioFromFile(file: File): Promise<Scenario> {
  return (await transfer()).importScenarioJson(await file.text());
}

export async function downloadAdventureJson(a: Adventure): Promise<void> {
  downloadText(`${safeName(a.title)}.storyloom.json`, (await transfer()).exportAdventureJson(a));
}

/** A copy with fresh ids, so the scenario's cards and entities never share an id with the adventure's. */
export async function saveAsScenario(a: Adventure): Promise<Scenario> {
  const [{ renumberScenario, scenarioFromAdventure }, { storage }] = await Promise.all([transfer(), import('@app/services')]);
  const s = renumberScenario(scenarioFromAdventure(a));
  await storage.putScenario(s);
  return s;
}

export async function downloadAdventureText(a: Adventure): Promise<void> {
  downloadText(`${safeName(a.title)}.txt`, (await transfer()).exportAdventureText(a), 'text/plain');
}

/** Markdown (a zip when it has pictures) or EPUB; returns how many pictures had no stored image and were left out. */
export async function downloadStory(a: Adventure, format: 'markdown' | 'epub', playerLines: PlayerLines): Promise<number> {
  const [t, { storage }] = await Promise.all([transfer(), import('@app/services')]);
  const story = t.storyParts(a, playerLines);
  const images = new Map<string, StoryImage>();
  let missing = 0;
  for (const id of new Set(story.chapters.flatMap((c) => c.blocks.flatMap((b) => (b.kind === 'image' ? [b.imageId] : []))))) {
    const blob = await storage.getImage(a.id, id);
    if (blob) images.set(id, { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type });
    else missing++;
  }
  const name = safeName(a.title, 'story');
  if (format === 'epub') downloadText(`${name}.epub`, t.exportStoryEpub(story, images), 'application/epub+zip');
  else {
    const { data, ext } = t.exportStoryMarkdown(story, images);
    downloadText(`${name}.${ext}`, data, ext === 'zip' ? 'application/zip' : 'text/markdown');
  }
  return missing;
}

export async function downloadTraces(a: Adventure): Promise<void> {
  const { storage } = await import('@app/services');
  downloadText(`${safeName(a.title)}.traces.jsonl`, (await transfer()).exportTracesJsonl(await storage.listTraces(a.id)), 'application/x-ndjson');
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Import from a picked file: our JSON, an AID JSON, or an AID zip. */
export async function importAdventureFromFile(file: File, settings: Adventure['settings']): Promise<ImportResult> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    return (await transfer()).importAidZip(await file.arrayBuffer(), settings);
  }
  return (await transfer()).importAdventureJson(await file.text(), settings);
}

export async function downloadStoryCards(a: Pick<Adventure, 'title' | 'storyCards'>): Promise<void> {
  downloadText(`${safeName(a.title, 'cards')}.cards.json`, (await transfer()).exportStoryCardsJson(a.storyCards));
}

export async function importStoryCardsFromFile(file: File): Promise<{ cards: Adventure['storyCards']; warnings: string[] }> {
  return (await transfer()).importStoryCardsJson(await file.text());
}
