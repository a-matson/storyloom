import { describe, expect, it } from 'vitest';
import { checkTitle, titleChapters } from '@core/memory/chapterTitle';
import { CHAPTER_MIN, chapterOf, chapterStarts, withChapter } from '@core/memory/chapters';
import { compileCodex } from '@core/memory/codex';
import { byPlayer } from '@core/memory/looks';
import { YOU } from '@core/memory/you';
import { fakeDeps, memoryAdventure } from './fixtures/memoryJobs';

const moves = (...ats: number[]) => ats.map((at, i) => ({ at, location: `place${i}` }));

describe('chapters', () => {
  it('starts one at a scene move 10 or more actions after the last start, not sooner', () => {
    expect(CHAPTER_MIN).toBe(10);
    expect(chapterStarts({ sceneLog: moves(4, 12, 16, 22) }).map((c) => c.at)).toEqual([0, 12, 22]);
    expect(chapterStarts({}).map((c) => c.at)).toEqual([0]);
  });

  it('always starts one at a /chapter mark, which resets the count', () => {
    const plot = { sceneLog: moves(12, 20), chapters: [{ at: 3, title: 'Mine' }, { at: 14 }] };
    expect(chapterStarts(plot)).toEqual([{ at: 0 }, { at: 3, title: 'Mine' }, { at: 14 }]);
  });

  it('storing a title at a start moves no start', () => {
    const plot = { sceneLog: moves(12, 15, 24) };
    const before = chapterStarts(plot).map((c) => c.at);
    expect(chapterStarts({ ...plot, chapters: withChapter(undefined, { at: 12, title: 'T', seen: false }) }).map((c) => c.at)).toEqual(before);
  });

  it('finds the chapter an action belongs to', () => {
    const starts = chapterStarts({ sceneLog: moves(12, 30) });
    expect([0, 11, 12, 29, 30, 99].map((at) => chapterOf(starts, at))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('withChapter replaces the entry at the same start and keeps order', () => {
    expect(withChapter([{ at: 9 }, { at: 3, title: 'a' }], { at: 3, title: 'b' })).toEqual([{ at: 3, title: 'b' }, { at: 9 }]);
  });

  it('keeps a title to its first line, unquoted, at most 8 words', () => {
    expect(checkTitle('"The Ferryman\'s Debt."\nmore')).toBe("The Ferryman's Debt");
    expect(checkTitle('  ')).toBeUndefined();
    expect(checkTitle('one two three four five six seven eight nine')).toBe('one two three four five six seven eight');
  });

  it('titles each closed chapter once, from its events, as a proposal', async () => {
    const adv = memoryAdventure(30);
    adv.plot.sceneLog = moves(12);
    adv.assertions = [byPlayer(YOU, 3, { kind: 'event', text: 'You met Tamsin.', who: [YOU] })];
    const { deps, calls } = fakeDeps(adv);
    expect(await titleChapters(adv, deps)).toBe(1);
    expect(calls[0]).toContain('- You met Tamsin.');
    expect(adv.plot.chapters).toEqual([{ at: 0, title: 'sum:text', seen: false }]);
    expect(await titleChapters(adv, deps)).toBe(0);
  });

  it('marks chapters on the codex timeline once there are two', () => {
    const adv = memoryAdventure(30);
    expect(compileCodex(adv).timeline.some((l) => l.text.startsWith('Chapter'))).toBe(false);
    adv.plot.sceneLog = moves(12);
    adv.plot.chapters = [{ at: 12, title: 'Docks' }];
    const timeline = compileCodex(adv).timeline.map((l) => l.text);
    expect(timeline).toEqual(['Chapter 1', 'Chapter 2: Docks', 'Scene moves to place0']);
  });
});
