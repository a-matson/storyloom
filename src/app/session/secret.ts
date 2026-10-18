import { newSecret, YOU } from '@core/memory';
import { actionText } from '@core/model';
import type { GameSession } from './session';

/** Marking a Do/Say secret and who knows it; the gist's edit and delete are `lineEdits`. */
export function secretEdits(host: GameSession) {
  return {
    markSecret: (actionId: string, text: string, knownBy: readonly string[]) =>
      host.mutate((log, adv) => {
        const at = log.actions.findIndex((a) => a.id === actionId);
        const action = log.actions[at];
        if (action && text.trim()) adv.assertions = [...adv.assertions, newSecret(at, text.trim(), knownBy, actionText(action))];
      }),
    /** You always know your own secret. */
    setKnownBy: (lineId: string, knownBy: readonly string[]) =>
      host.mutate((_, adv) => {
        adv.assertions = adv.assertions.map((a) => (a.id === lineId && a.kind === 'secret' ? { ...a, knownBy: [...new Set([YOU, ...knownBy])] } : a));
      }),
  };
}
