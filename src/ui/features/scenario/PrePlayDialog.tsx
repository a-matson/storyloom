import { useState } from 'react';
import { missingAnswers, placeholderQuestions, type Scenario } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Drawer, DrawerBody, DrawerHeader } from '@ui/components/ui/drawer';
import { Input } from '@ui/components/ui/field';
import { TopBarTitle } from '@ui/components/ui/top-bar';

interface Props {
  scenario: Scenario;
  onBegin: (answers: Record<string, string>) => void;
  onClose: () => void;
}

/** Asks each `${placeholder}` once before the adventure starts. */
export function PrePlayDialog({ scenario, onBegin, onClose }: Props) {
  const questions = placeholderQuestions(scenario);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const ready = missingAnswers(questions, answers).length === 0;
  const title = scenario.title === '' ? 'Untitled scenario' : scenario.title;
  return (
    <Drawer label={title} onClose={onClose} className="w-[min(560px,100vw)]">
      <DrawerHeader title={<TopBarTitle>{title}</TopBarTitle>} onClose={onClose} />
      <form
        className="flex grow flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onBegin(answers);
        }}
      >
        <DrawerBody>
          {scenario.description !== '' && <p className="m-0 text-muted-foreground">{scenario.description}</p>}
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
          <Button type="submit" variant="primary" disabled={!ready}>
            Begin
          </Button>
        </footer>
      </form>
    </Drawer>
  );
}
