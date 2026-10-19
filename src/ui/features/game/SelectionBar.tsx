import { useEffect, useRef, useState } from 'react';
import { makeItem, pinFact } from '@app/session/correct';
import { addRule, findRulesIn } from '@app/session/rules';
import type { Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Select } from '@ui/components/ui/field';
import { SelectionCheck } from './SelectionCheck';

interface Picked {
  text: string;
  actionId: string;
  top: number;
  left: number;
}

/** A name, not a sentence: longer selections only pin. [provisional] */
const ITEM_CHARS = 40;

const el = (n: Node | null) => (n instanceof Element ? n : n?.parentElement);

/** Text selected inside one story action, else null; an action being edited has its own selection. */
function picked(): Picked | null {
  const s = document.getSelection();
  const text = s?.toString().trim() ?? '';
  if (!s || !text || s.rangeCount === 0) return null;
  const range = s.getRangeAt(0);
  // The start's action: a triple-click ends the range at the start of the next one.
  const block = el(range.startContainer)?.closest<HTMLElement>('#story [data-action-id]');
  if (!block?.dataset['actionId'] || block.querySelector('[contenteditable="true"]')) return null;
  const r = range.getBoundingClientRect();
  return { text, actionId: block.dataset['actionId'], top: Math.max(8, r.top - 44), left: Math.max(8, r.left) };
}

/** Pin selected story text as a rule, as a fact about a character, or as a new item; or check it against the record. */
export function SelectionBar({ api, entities }: { api: GameApi; entities: readonly Entity[] }) {
  const [sel, setSel] = useState<Picked | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus in the bar (the character select) collapses the story selection; keep what was picked.
    const onChange = () => !bar.current?.contains(document.activeElement) && setSel(picked());
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);
  if (!sel) return null;
  const done = () => {
    document.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const characters = entities.filter((e) => e.kind === 'character');
  return (
    // ponytail: placed once at the selection; scrolling leaves it behind until the selection changes.
    <div
      ref={bar}
      role="toolbar"
      aria-label="Pin selection"
      tabIndex={-1}
      className="fixed z-30 flex gap-1.5 rounded-lg border border-border bg-card p-1 shadow-lg"
      style={{ top: sel.top, left: sel.left }}
      onKeyDown={(e) => e.key === 'Escape' && done()}
    >
      <Button
        className="h-8"
        onClick={() => {
          void addRule(api, sel.text);
          done();
        }}
      >
        Pin as rule
      </Button>
      <Button
        className="h-8"
        onClick={() => {
          void findRulesIn(
            api,
            api.adv.actions.findIndex((a) => a.id === sel.actionId),
          );
          done();
        }}
      >
        Find rules
      </Button>
      {characters.length > 0 && (
        <Select
          aria-label="Pin as fact about"
          className="h-8 w-auto"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            pinFact(api, e.target.value, sel.text, sel.actionId);
            done();
          }}
        >
          <option value="">Pin as fact about…</option>
          {characters.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      )}
      {sel.text.length <= ITEM_CHARS && (
        <Button
          className="h-8"
          onClick={() => {
            makeItem(api, sel.text, sel.actionId);
            done();
          }}
        >
          Make item
        </Button>
      )}
      <SelectionCheck key={sel.text} api={api} text={sel.text} />
    </div>
  );
}
