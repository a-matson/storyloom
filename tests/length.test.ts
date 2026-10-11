import { describe, expect, it } from 'vitest';
import { buildContext, type ContextBuildInput } from '@core/context';
import { createApproxTokenizer, lengthLine } from '@core/text';

describe('lengthLine', () => {
  it.each([
    [100, 'Replies run about 70 words in 1 paragraph.'],
    [200, 'Replies run about 140 words in 2 paragraphs.'],
    [250, 'Replies run about 180 words in 2 paragraphs.'],
    [400, 'Replies run about 290 words in 3 paragraphs.'],
  ])('%i tokens', (tokens, line) => {
    expect(lengthLine(tokens)).toBe(line);
  });
});

function input(authorsNote: string | undefined, line: string | undefined): ContextBuildInput {
  return {
    actions: [],
    plot: { ...(authorsNote !== undefined && { authorsNote }) },
    storyCards: [],
    entities: [],
    rankedMemories: [],
    settings: { contextLength: 2000, memoryBankEnabled: false, cacheStableLayout: true, evictionChunk: 8, ...(line !== undefined && { lengthLine: line }) },
    tokenizer: createApproxTokenizer(),
  };
}

const note = (i: ContextBuildInput) => buildContext(i).sections.find((s) => s.kind === 'authorsNote')?.text;

describe("Author's note with the length line", () => {
  const line = lengthLine(200);

  it('joins the note and the line', () => {
    expect(note(input('Keep it grim.', line))).toBe(`[Author's note: Keep it grim; ${line}]`);
  });

  it('renders the line alone when there is no note', () => {
    expect(note(input(undefined, line))).toBe(`[Author's note: ${line}]`);
  });

  it('leaves the note untouched when the line is off', () => {
    expect(note(input('Keep it grim.', undefined))).toBe("[Author's note: Keep it grim.]");
    expect(note(input(undefined, undefined))).toBeUndefined();
  });
});
