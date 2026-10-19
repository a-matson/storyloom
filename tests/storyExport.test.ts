import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportStoryEpub, exportStoryMarkdown, storyParts, type StoryImage } from '@adapters/transfer';
import { escapeXml } from '@adapters/transfer/epub';
import { CHAPTER_MIN } from '@core/memory/chapters';
import { createBlankAdventure, type Action, type Adventure } from '@core/model';

const act = (id: string, type: Action['type'], text: string, image?: Action['image']): Action => ({
  id,
  type,
  versions: [text],
  active: 0,
  createdAt: 1,
  ...(image && { image }),
});

function adventure(): Adventure {
  const a = createBlankAdventure('The <Hollow> & Co', 'You wake in the hollow.');
  a.actions.push(act('a1', 'do', '> You open the door.'), act('a2', 'see', '', { imageId: 'img_1', brief: 'the door', prompt: 'SECRET PROMPT' }));
  for (let i = 3; i < CHAPTER_MIN + 2; i++) a.actions.push(act(`a${i}`, 'continue', `Line ${i}.\nSecond ${i}.`));
  a.actions.push(act('gone', 'see', '', { imageId: 'img_gone', prompt: 'p' }));
  a.entities = [{ id: 'ent_inn', kind: 'place', name: 'The Inn', aliases: [] } as unknown as Adventure['entities'][number]];
  a.plot = { ...a.plot, sceneLog: [{ at: CHAPTER_MIN + 1, location: 'ent_inn' }], storySummary: 'PLOT TEXT' };
  a.storyCards = [{ id: 'c', keys: ['k'], entry: 'CARD TEXT', type: 'other', title: 'Card' } as unknown as Adventure['storyCards'][number]];
  return a;
}

const images = new Map<string, StoryImage>([['img_1', { bytes: new Uint8Array([1, 2, 3]), type: 'image/png' }]]);

describe('story export', () => {
  it('splits at chapter starts and titles a chapter by its place', () => {
    const s = storyParts(adventure(), 'narration');
    expect(s.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'The Inn']);
  });

  it('writes player lines as narration or keeps them quoted', () => {
    const text = (mode: 'narration' | 'quoted') => storyParts(adventure(), mode).chapters[0]!.blocks.flatMap((b) => (b.kind === 'text' ? [b.text] : []));
    expect(text('narration')).toContain('You open the door.');
    expect(text('quoted')).toContain('> You open the door.');
  });

  it('leaves out prompts, cards and plot, and a picture with no stored image', () => {
    const { data, ext } = exportStoryMarkdown(storyParts(adventure(), 'narration'), new Map());
    expect(ext).toBe('md');
    expect(data).toContain('## The Inn');
    expect(data).not.toMatch(/SECRET PROMPT|CARD TEXT|PLOT TEXT|!\[/);
  });

  it('zips the Markdown with its pictures', () => {
    const { data, ext } = exportStoryMarkdown(storyParts(adventure(), 'narration'), images);
    expect(ext).toBe('zip');
    const files = unzipSync(data as Uint8Array);
    expect(Object.keys(files).toSorted()).toEqual(['images/1.png', 'story.md']);
    expect(strFromU8(files['story.md']!)).toContain('![the door](images/1.png)');
  });

  it('builds an EPUB: stored mimetype first, every chapter and picture in the manifest, text escaped', () => {
    const zip = exportStoryEpub(storyParts(adventure(), 'quoted'), images, new Date('2026-10-19T10:00:00.123Z'));
    // Local header: name length at byte 26, compression method at byte 8 (0 = stored), name at byte 30.
    expect(strFromU8(zip.subarray(30, 38))).toBe('mimetype');
    expect(zip[8]).toBe(0);
    const files = unzipSync(zip);
    const opf = strFromU8(files['OEBPS/content.opf']!);
    expect(opf).toContain('href="ch1.xhtml"');
    expect(opf).toContain('href="ch2.xhtml"');
    expect(opf).toContain('href="images/1.png" media-type="image/png"');
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-19T10:00:00Z</meta>');
    expect(opf).toContain('<dc:title>The &lt;Hollow&gt; &amp; Co</dc:title>');
    expect(files['OEBPS/images/1.png']).toEqual(new Uint8Array([1, 2, 3]));
    expect(strFromU8(files['OEBPS/ch1.xhtml']!)).toContain('<p>&gt; You open the door.</p>');
    expect(escapeXml(`<a & "b">`)).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });
});
