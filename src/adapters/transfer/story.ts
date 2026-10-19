import { strToU8, zipSync } from 'fflate';
import { chapterOf, chapterStarts, placeAt } from '@core/memory';
import type { Adventure } from '@core/model';

/** `quoted` keeps the player's turns as the `> You …` lines the story was played with. */
export type PlayerLines = 'narration' | 'quoted';
export type StoryBlock = { kind: 'text'; text: string } | { kind: 'image'; imageId: string; alt: string };
export interface StoryChapter {
  title: string;
  blocks: StoryBlock[];
}
export interface Story {
  id: string;
  title: string;
  chapters: StoryChapter[];
}
export interface StoryImage {
  bytes: Uint8Array;
  type: string;
}
/** A picture's file inside the export, relative to the text that shows it. */
export interface StoryPicture extends StoryImage {
  path: string;
}

/** What a reader reads: the prose, one block per paragraph, and the chosen pictures, split at the chapter starts. No prompts, cards, memories or plot. */
export function storyParts(adv: Pick<Adventure, 'id' | 'title' | 'actions' | 'plot' | 'entities'>, playerLines: PlayerLines): Story {
  const starts = chapterStarts(adv.plot);
  const places = adv.entities.filter((e) => e.kind === 'place');
  const chapters: StoryChapter[] = starts.map((c, i) => {
    const place = placeAt(places, adv.plot.sceneLog?.find((s) => s.at === c.at)?.location);
    return { title: (c.seen !== false && c.title) || place?.name || `Chapter ${i + 1}`, blocks: [] };
  });
  for (const [at, a] of adv.actions.entries()) {
    const blocks = chapters[chapterOf(starts, at)]?.blocks ?? [];
    if (a.type === 'see') {
      if (a.image?.imageId && !a.image.missing) blocks.push({ kind: 'image', imageId: a.image.imageId, alt: a.image.brief ?? '' });
      continue;
    }
    const narrate = playerLines === 'narration' && (a.type === 'do' || a.type === 'say');
    for (const line of (a.versions[a.active] ?? '').split('\n')) {
      const text = (narrate ? line.replace(/^\s*>\s?/, '') : line).trim();
      if (text) blocks.push({ kind: 'text', text });
    }
  }
  return { id: adv.id, title: adv.title.trim() || 'Untitled', chapters };
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** The pictures `images` has bytes for, by image id, in story order; a picture with none is left out. */
export function storyPictures(story: Story, images: ReadonlyMap<string, StoryImage>): Map<string, StoryPicture> {
  const out = new Map<string, StoryPicture>();
  for (const b of story.chapters.flatMap((c) => c.blocks)) {
    const image = b.kind === 'image' && !out.has(b.imageId) ? images.get(b.imageId) : undefined;
    if (b.kind === 'image' && image) out.set(b.imageId, { ...image, path: `images/${out.size + 1}.${EXT[image.type] ?? 'png'}` });
  }
  return out;
}

/** `# title`, `## chapter`, a paragraph per block; with pictures, a zip of `story.md` and `images/`. */
export function exportStoryMarkdown(story: Story, images: ReadonlyMap<string, StoryImage>): { data: string | Uint8Array; ext: 'md' | 'zip' } {
  const pics = storyPictures(story, images);
  const block = (b: StoryBlock) => {
    if (b.kind === 'text') return [b.text];
    const pic = pics.get(b.imageId);
    return pic ? [`![${b.alt.replace(/[[\]\n]/g, ' ')}](${pic.path})`] : [];
  };
  const md = [`# ${story.title}`, ...story.chapters.flatMap((c) => [`## ${c.title}`, ...c.blocks.flatMap(block)])].join('\n\n') + '\n';
  if (!pics.size) return { data: md, ext: 'md' };
  const files = Object.fromEntries([...pics.values()].map((p) => [p.path, [p.bytes, { level: 0 }] as const]));
  return { data: zipSync({ 'story.md': strToU8(md), ...files }), ext: 'zip' };
}
