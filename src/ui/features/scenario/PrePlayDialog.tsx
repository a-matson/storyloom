import { useState, type ReactNode } from 'react';
import { creatorChoices, missingAnswers, placeholderQuestions, type Scenario } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { Input } from '@ui/components/ui/field';
import { TopBarTitle } from '@ui/components/ui/top-bar';

interface Props {
  scenario: Scenario;
  /** The adventure is being created (the Character Creator opening can take a while). */
  busy: boolean;
  /** `leaf`: the scenario reached through any Multiple Choice options. */
  onBegin: (leaf: Scenario, answers: Record<string, string>, picked: string[]) => void;
  onClose: () => void;
}

/** Multiple Choice options down to a leaf, then its Character Creator picks and `${placeholders}`. */
export function PrePlayDialog({ scenario, busy, onBegin, onClose }: Props) {
  const [trail, setTrail] = useState<Scenario[]>([]);
  const node = trail.at(-1) ?? scenario;
  const title = scenario.title === '' ? 'Untitled scenario' : scenario.title;
  const back = trail.length > 0 && (
    <Button type="button" variant="ghost" onClick={() => setTrail((t) => t.slice(0, -1))}>
      Back
    </Button>
  );
  return (
    <Drawer label={title} onClose={onClose} className="w-[min(560px,100vw)]">
      <DrawerHeader title={<TopBarTitle>{title}</TopBarTitle>} onClose={onClose} />
      {node.type === 'multipleChoice' ? (
        <>
          <DrawerBody>
            {node.prompt !== '' && <p className="m-0 whitespace-pre-wrap font-display text-body">{node.prompt}</p>}
            {(node.options ?? []).map((o, i) => (
              <Button key={o.id} className="h-auto justify-start py-2.5 text-left" onClick={() => setTrail((t) => [...t, o])}>
                {o.title === '' ? `Option ${i + 1}` : o.title}
              </Button>
            ))}
            {(node.options ?? []).length === 0 && <p className="m-0 text-muted-foreground">This choice has no options yet.</p>}
          </DrawerBody>
          <footer className="flex gap-2 border-t border-border px-6 py-3.5">{back}</footer>
        </>
      ) : (
        <LeafForm key={node.id} leaf={node} busy={busy} back={back} onBegin={onBegin} onClose={onClose} />
      )}
    </Drawer>
  );
}

function LeafForm({ leaf, busy, back, onBegin, onClose }: Omit<Props, 'scenario'> & { leaf: Scenario; back: ReactNode }) {
  const questions = placeholderQuestions(leaf);
  const choices = creatorChoices(leaf);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const ready = missingAnswers(questions, answers).length === 0 && choices.every((g) => picks[g.type] !== undefined);
  return (
    <form
      className="flex grow flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onBegin(leaf, answers, Object.values(picks));
      }}
    >
      <DrawerBody>
        {leaf.description !== '' && <p className="m-0 text-muted-foreground">{leaf.description}</p>}
        {choices.map((g) => (
          <fieldset key={g.type} className="flex flex-col gap-1.5">
            <legend className="mb-1.5 font-semibold">Choose your {g.type}</legend>
            {g.options.map((c) => (
              <label key={c.id} className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 has-checked:border-primary">
                <input
                  type="radio"
                  name={`pick-${g.type}`}
                  className="mt-1"
                  checked={picks[g.type] === c.id}
                  onChange={() => setPicks((p) => ({ ...p, [g.type]: c.id }))}
                />
                <span className="flex flex-col">
                  <span>{c.name}</span>
                  {c.notes !== undefined && <span className="text-caption text-muted-foreground">{c.notes}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        {questions.map((q) => (
          <label key={q.key} className="flex flex-col gap-1.5">
            <span>{q.label}</span>
            <Input value={answers[q.key] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
          </label>
        ))}
      </DrawerBody>
      <footer className="flex gap-2 border-t border-border px-6 py-3.5">
        {back}
        <span className="grow" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {!busy ? 'Begin' : leaf.type === 'characterCreator' ? 'Writing your opening…' : 'Starting…'}
        </Button>
      </footer>
    </form>
  );
}
