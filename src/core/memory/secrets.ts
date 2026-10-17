import type { Adventure, Assertion, Entity, PlotComponents } from '../model/types';
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

/** "Minos", "Minos and Weever", "Minos, Weever and Okafor". */
export const andList = (names: readonly string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** `known only to you and Minos`; a knower whose entity is gone is left out. */
export function knownByLabel(s: Secret, entities: readonly Pick<Entity, 'id' | 'name'>[]): string {
  const name = new Map(entities.map((e) => [e.id, e.name]));
  return `known only to ${andList(['you', ...s.knownBy.flatMap((k) => (k === YOU ? [] : (name.get(k) ?? [])))])}`;
}

/** The secrets marked on actions `[fromAction, toAction)`: what a memory over that range tells. */
export const secretsIn = (as: readonly Assertion[], r: { fromAction: number; toAction: number }): Secret[] =>
  secretsOf(as).filter((s) => s.at >= r.fromAction && s.at < r.toAction);

/** `(known only to you and Minos) `, the mark a memory over the range carries when it tells a secret; '' otherwise. */
export function markOf(as: readonly Assertion[], entities: readonly Pick<Entity, 'id' | 'name'>[], r: { fromAction: number; toAction: number }): string {
  const labels = [...new Set(secretsIn(as, r).map((s) => knownByLabel(s, entities)))];
  return labels.length ? `(${labels.join('; ')}) ` : '';
}

const repoint = (ids: readonly string[], fromId: string, intoId: string) => [...new Set(ids.map((k) => (k === fromId ? intoId : k)))];

/** `fromId` merged into `intoId`: whoever knew or took part as one name did as the other. */
export const repointSecrets = (adv: Pick<Adventure, 'assertions'>, fromId: string, intoId: string) =>
  (adv.assertions = adv.assertions.map((a) =>
    a.kind === 'secret' && a.knownBy.includes(fromId)
      ? { ...a, knownBy: repoint(a.knownBy, fromId, intoId) }
      : a.kind === 'event' && a.who.includes(fromId)
        ? { ...a, who: repoint(a.who, fromId, intoId) }
        : a,
  ));
