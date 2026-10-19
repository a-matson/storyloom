import { useEffect, useRef, useState } from 'react';
import { addAlias, makeItem, pinFact } from '@app/session/correct';
import { addRule, findRulesIn } from '@app/session/rules';
import { secretEdits } from '@app/session/secret';
import { defaultKnownBy, matchEntity, YOU } from '@core/memory';
import type { Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { branchFrom } from './OutputTools';
import { SelectionCheck } from './SelectionCheck';
import { SelectionPick } from './SelectionPick';

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

/** Pin selected story text as a rule, a fact, an alias, a secret or a new item; or check it against the record. */
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
  const run = (fn: () => unknown) => () => {
    void fn();
    document.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const at = () => api.adv.actions.findIndex((a) => a.id === sel.actionId);
  const characters = entities.filter((e) => e.kind === 'character');
  const short = sel.text.length <= ITEM_CHARS;
  return (
    // ponytail: placed once at the selection; scrolling leaves it behind until the selection changes.
    <div
      ref={bar}
      role="toolbar"
      aria-label="Pin selection"
      tabIndex={-1}
      className="fixed z-30 flex gap-1.5 rounded-lg border border-border bg-card p-1 shadow-lg"
      style={{ top: sel.top, left: sel.left }}
      onKeyDown={(e) => e.key === 'Escape' && run(() => undefined)()}
    >
      <Button className="h-8" onClick={run(() => addRule(api, sel.text))}>
        Pin as rule
      </Button>
      <Button className="h-8" onClick={run(() => findRulesIn(api, at()))}>
        Find rules
      </Button>
      {characters.length > 0 && (
        <SelectionPick
          label="Pin as fact about"
          prompt="Pin as fact about…"
          characters={characters}
          onPick={(id) => run(() => pinFact(api, id, sel.text, sel.actionId))()}
        />
      )}
      {short && characters.length > 0 && !matchEntity(entities, sel.text) && (
        <SelectionPick label="This is" prompt="This is…" characters={characters} onPick={(id) => run(() => addAlias(api, id, sel.text))()} />
      )}
      <Button
        className="h-8"
        onClick={run(() => {
          secretEdits(api).markSecret(
            sel.actionId,
            sel.text,
            defaultKnownBy(api.adv.plot, at()).filter((k) => k !== YOU),
          );
          api.emit({ notice: 'Secret saved: who knows it is in World › Secrets' });
        })}
      >
        Mark secret
      </Button>
      {short && (
        <Button className="h-8" onClick={run(() => makeItem(api, sel.text, sel.actionId))}>
          Make item
        </Button>
      )}
      <Button className="h-8" onClick={run(() => branchFrom(api, sel.actionId))}>
        Branch from here
      </Button>
      <SelectionCheck key={sel.text} api={api} text={sel.text} />
    </div>
  );
}
