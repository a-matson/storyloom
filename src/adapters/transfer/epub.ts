import { strToU8, zipSync } from 'fflate';
import { storyPictures, type Story, type StoryBlock, type StoryImage, type StoryPicture } from './story';

const ENTITY: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = (s: string): string => s.replace(/[<>&"']/g, (c) => ENTITY[c] ?? c);

const XML = '<?xml version="1.0" encoding="utf-8"?>\n';
const page = (title: string, body: string) =>
  `${XML}<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">\n` +
  `<head><title>${escapeXml(title)}</title></head>\n<body>\n${body}\n</body>\n</html>\n`;

const CONTAINER =
  `${XML}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
  `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n`;

function blockXhtml(b: StoryBlock, pics: ReadonlyMap<string, StoryPicture>): string {
  if (b.kind === 'text') return `<p>${escapeXml(b.text)}</p>`;
  const pic = pics.get(b.imageId);
  return pic ? `<p><img src="${pic.path}" alt="${escapeXml(b.alt)}"/></p>` : '';
}

function opf(story: Story, pics: StoryPicture[], modified: string): string {
  const chapters = story.chapters.map((_, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
  const images = pics.map((p, i) => `<item id="img${i + 1}" href="${p.path}" media-type="${escapeXml(p.type || 'image/png')}"/>`);
  return (
    `${XML}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="uid">urn:storyloom:${escapeXml(story.id)}</dc:identifier>\n` +
    `<dc:title>${escapeXml(story.title)}</dc:title>\n<dc:language>en</dc:language>\n<meta property="dcterms:modified">${modified}</meta>\n</metadata>\n` +
    `<manifest>\n<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n${[...chapters, ...images].join('\n')}\n</manifest>\n` +
    `<spine>\n${story.chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join('\n')}\n</spine>\n</package>\n`
  );
}

/** An EPUB 3: `mimetype` first and stored, as the format requires; one XHTML page per chapter. */
export function exportStoryEpub(story: Story, images: ReadonlyMap<string, StoryImage>, now = new Date()): Uint8Array {
  const pics = storyPictures(story, images);
  const toc = story.chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${escapeXml(c.title)}</a></li>`).join('\n');
  const chapters = story.chapters.map(
    (c, i) =>
      [`OEBPS/ch${i + 1}.xhtml`, strToU8(page(c.title, [`<h2>${escapeXml(c.title)}</h2>`, ...c.blocks.map((b) => blockXhtml(b, pics))].join('\n')))] as const,
  );
  const files = [...pics.values()].map((p) => [`OEBPS/${p.path}`, [p.bytes, { level: 0 }]] as const);
  return zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(opf(story, [...pics.values()], now.toISOString().replace(/\.\d+Z$/, 'Z'))),
    'OEBPS/nav.xhtml': strToU8(page(story.title, `<nav epub:type="toc" id="toc"><h1>${escapeXml(story.title)}</h1>\n<ol>\n${toc}\n</ol></nav>`)),
    ...Object.fromEntries(chapters),
    ...Object.fromEntries(files),
  });
}
