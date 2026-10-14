import type { Action } from '../model/types';
import { playerLine } from '../memory/you';
import { withContent } from '../text/content';
import { actionStoryText } from '../text/formatting';
import { trimHeadToTokens, trimToTokens, type Tokenizer } from '../text/tokenizer';
import { renderSection } from './render';
import type { ContextBuildInput, RenderedSections, SectionKind } from './types';

// When the cap is hit, lower-priority elements go first: a retry note is its retry's whole point, then the author's note.
const REQUIRED_PRIORITY: SectionKind[] = ['retryNote', 'authorsNote', 'plotEssentials', 'instructions', 'storySummary'];

/** Index of the most recent action that contributes story text (skips `see`). */
export function findLastActionIndex(actions: Action[]): number {
  return actions.findLastIndex((a) => actionStoryText(a) !== '');
}

export interface RequiredResult {
  lastActionIndex: number;
  lastActionText: string;
  lastTokens: number;
  frontMemory: string;
  frontTokens: number;
  /** The system prompt text (untrimmed), when instructions fit. */
  instructions: string;
  requiredUsed: number;
}

/** The note and the length line as one bracketed aside; either may be empty. */
function withLength(note: string, line: string | undefined): string {
  const l = line?.trim();
  return l ? (note ? `${note.replace(/[.;]\s*$/, '')}; ${l}` : l) : note;
}

function plotValues({ plot, assertions, overrides, retryNote, settings }: ContextBuildInput): Partial<Record<SectionKind, string>> {
  return {
    retryNote: (retryNote ?? '').trim(),
    authorsNote: withLength((overrides?.authorsNote || plot.authorsNote || '').trim(), settings.lengthLine),
    plotEssentials: (overrides?.plotEssentials || plot.plotEssentials || '').trim(),
    // The player line rides on the instructions so the cacheable prefix only changes when the player edits it.
    instructions: withContent([(plot.aiInstructions ?? '').trim(), playerLine(plot, assertions ?? [])].filter(Boolean).join('\n'), settings.content?.trim()),
    storySummary: (plot.storySummary ?? '').trim(),
  };
}

/** Last action, front memory and plot components, capped at `requiredCap` tokens. */
export function selectRequired(
  input: ContextBuildInput,
  requiredCap: number,
  out: RenderedSections,
  warnings: string[],
  dropped: SectionKind[],
): RequiredResult {
  const { actions, tokenizer } = input;
  const lastActionIndex = findLastActionIndex(actions);
  const last = actions[lastActionIndex];
  let lastActionText = last ? actionStoryText(last) : '';
  const frontMemory = (input.frontMemory ?? '').trim();
  let lastTokens = tokenizer.count(lastActionText);
  const frontTokens = tokenizer.count(frontMemory);
  if (lastTokens + frontTokens > requiredCap) {
    // Pathological: a single action larger than 70% of the budget. Keep its tail.
    lastActionText = trimHeadToTokens(lastActionText, Math.max(0, requiredCap - frontTokens), tokenizer);
    lastTokens = tokenizer.count(lastActionText);
    warnings.push('Last action exceeded the required budget and was trimmed from the start.');
  }

  const values = plotValues(input);
  const plotUsed = fitPlot(values, requiredCap - lastTokens - frontTokens, tokenizer, out, warnings, dropped);
  return {
    lastActionIndex,
    lastActionText,
    lastTokens,
    frontMemory,
    frontTokens,
    instructions: out.has('instructions') ? (values.instructions ?? '') : '',
    requiredUsed: lastTokens + frontTokens + plotUsed,
  };
}

/** Adds plot sections in priority order; the first that doesn't fit is trimmed and the rest dropped. */
function fitPlot(
  values: Partial<Record<SectionKind, string>>,
  budget: number,
  tokenizer: Tokenizer,
  out: RenderedSections,
  warnings: string[],
  dropped: SectionKind[],
): number {
  let remaining = budget;
  let used = 0;
  let full = false;
  for (const kind of REQUIRED_PRIORITY) {
    const text = values[kind] ?? '';
    if (!text) continue;
    if (full) {
      dropped.push(kind);
      continue;
    }
    const rendered = renderSection(kind, text);
    const tokens = tokenizer.count(rendered);
    if (tokens <= remaining) {
      out.set(kind, { text: rendered, tokens, trimmed: false });
      remaining -= tokens;
      used += tokens;
    } else if (remaining > 0) {
      const rt = renderSection(kind, trimToTokens(text, Math.max(0, remaining - 4), tokenizer));
      const rtTokens = tokenizer.count(rt);
      out.set(kind, { text: rt, tokens: rtTokens, trimmed: true });
      used += rtTokens;
      remaining = 0;
      full = true;
      warnings.push(`${kind} was trimmed to fit the required budget.`);
    } else {
      dropped.push(kind);
      full = true;
    }
  }
  return used;
}
