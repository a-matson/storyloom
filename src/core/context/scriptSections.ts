import type { ScriptSection } from '../ports/scripting';
import type { Tokenizer } from '../text/tokenizer';
import type { ContextSection, SectionKind } from './types';

/** Every kind a script may return; the Record makes TS complain when `SectionKind` grows. */
const KINDS: Record<SectionKind, true> = {
  instructions: true,
  plotEssentials: true,
  history: true,
  storyCards: true,
  storySummary: true,
  memories: true,
  authorsNote: true,
  scene: true,
  lastAction: true,
  frontMemory: true,
  script: true,
};
const isKind = (kind: string): kind is SectionKind => Object.hasOwn(KINDS, kind);

/** `kept`: the cached prefix still matches. `broken`: it changed. `rewritten`: the script replaced the whole body. */
export type ScriptCache = 'kept' | 'broken' | 'rewritten';

export interface AppliedSections {
  sections: ContextSection[];
  cache: 'kept' | 'broken';
}

/**
 * Merges the sections a script returned back into the built context: `tokens` and `trimmed`
 * are host-side facts, so they are recounted for changed text and an inserted section is
 * never cacheable. Editing `instructions` has no effect on the prompt (it is the system
 * message, not part of the body) but still counts as a broken prefix.
 */
export function applyScriptSections(returned: ScriptSection[], original: ContextSection[], tokenizer: Tokenizer): AppliedSections | { error: string } {
  const pool = new Map(original.map((s) => [s.kind, s]));
  const sections: ContextSection[] = [];
  let broken = false;
  let lastCacheable = -1;
  let firstInserted = -1;
  for (const { kind, text } of returned) {
    if (!isKind(kind)) return { error: `unknown section kind: ${kind}` };
    const prev = pool.get(kind);
    if (prev) {
      pool.delete(prev.kind);
      const changed = prev.text !== text;
      broken ||= changed && prev.cacheable;
      if (prev.cacheable) lastCacheable = sections.length;
      sections.push({ ...prev, text, ...(changed ? { tokens: tokenizer.count(text), trimmed: false } : {}) });
    } else {
      if (firstInserted < 0) firstInserted = sections.length;
      sections.push({ kind, text, tokens: tokenizer.count(text), cacheable: false });
    }
  }
  // A dropped cacheable section, or anything inserted inside the prefix, moves the cached bytes.
  broken ||= [...pool.values()].some((s) => s.cacheable);
  broken ||= firstInserted >= 0 && firstInserted < lastCacheable;
  return { sections, cache: broken ? 'broken' : 'kept' };
}
