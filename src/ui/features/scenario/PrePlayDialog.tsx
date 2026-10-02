import { useState } from 'react';
import { creatorChoices, missingAnswers, placeholderQuestions, type Scenario } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { Input } from '@ui/components/ui/field';
import { TopBarTitle } from '@ui/components/ui/top-bar';

interface Props {
  scenario: Scenario;
  /** The adventure is being created (the Character Creator opening can take a while). */
  busy: boolean;
  onBegin: (answers: Record<string, string>, picked: string[]) => void;
  onClose: () => void;
}

/** Character Creator picks (one card per Type), then each `${placeholder}` once, before the adventure starts. */
export function PrePlayDialog({ scenario, busy, onBegin, onClose }: Props) {
  const questions = placeholderQuestions(scenario);
  const choices = creatorChoices(scenario);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const ready = missingAnswers(questions, answers).length === 0 && choices.every((g) => picks[g.type] !== undefined);
  const title = scenario.title === '' ? 'Untitled scenario' : scenario.title;
  return (
    <Drawer label={title} onClose={onClose} className="w-[min(560px,100vw)]">
      <DrawerHeader title={<TopBarTitle>{title}</TopBarTitle>} onClose={onClose} />
      <form
        className="flex grow flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) onBegin(answers, Object.values(picks));
        }}
      >
        <DrawerBody>
          {scenario.description !== '' && <p className="m-0 text-muted-foreground">{scenario.description}</p>}
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
          <span className="grow" />
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!ready || busy}>
            {!busy ? 'Begin' : scenario.type === 'characterCreator' ? 'Writing your opening…' : 'Starting…'}
          </Button>
        </footer>
      </form>
    </Drawer>
  );
}
