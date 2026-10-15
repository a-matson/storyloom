import type { Adventure, Assertion, PlotComponents } from '../model/types';
import type { AssertionOf } from './assertionIndex';
import { byPlayer } from './looks';
import { YOU } from './you';

export type Secret = AssertionOf<'secret'>;

/** Entity ids present at action `at`: the last `presence` change at or before it. */
export const presentAt = (presence: PlotComponents['presence'], at: number): string[] => presence?.findLast((p) => p.at <= at)?.present ?? [];

/** Who knows a secret marked at `at`, unless the player says otherwise: you and whoever was there. */
export const defaultKnownBy = (plot: Pick<PlotComponents, 'presence'>, at: number): string[] => [YOU, ...presentAt(plot.presence, at)];

/** A secret the player marked on action `at`: pinned, so no edit of the story drops it. */
export const newSecret = (at: number, text: string, knownBy: readonly string[]): Assertion => ({
  ...byPlayer(YOU, at, { kind: 'secret', text, knownBy: [...new Set([YOU, ...knownBy])] }),
  pinned: true,
});

export const secretsOf = (as: readonly Assertion[]): Secret[] => as.filter((a): a is Secret => a.kind === 'secret');

/** `fromId` merged into `intoId`: whoever knew as one name knows as the other. */
export const repointSecrets = (adv: Pick<Adventure, 'assertions'>, fromId: string, intoId: string) =>
  (adv.assertions = adv.assertions.map((a) =>
    a.kind === 'secret' && a.knownBy.includes(fromId) ? { ...a, knownBy: [...new Set(a.knownBy.map((k) => (k === fromId ? intoId : k)))] } : a,
  ));
