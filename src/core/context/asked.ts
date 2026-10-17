import { type AssertionIndex, isCurrent, textOf } from '../memory/assertionIndex';
import { entityNamedIn } from '../memory/entities';
import { admitted, bm25, buildIndex, contentTerms, tokenise } from '../memory/lexical';
import { isPlayerAction } from '../memory/memoryBank';
import { namesOf } from '../memory/names';
import { actionText, type Action, type Assertion, type Entity } from '../model/types';

/** Facts an absent entity the player asks about sends at most. [provisional] */
export const ASKED_FACTS = 2;

// `looked:` traits are replaced looks; `seen: false` is a proposal.
const factLike = (a: Assertion) => isCurrent(a) && a.seen !== false && (a.kind === 'relationship' || (a.kind === 'trait' && !a.text.startsWith('looked: ')));

/**
 * Per mentioned entity the player's last action names (name, alias or role), its trait and relationship facts
 * that `admitted` lets through on that action alone, best first, at most `ASKED_FACTS`. The corpus is every
 * confirmed entity's facts without its own names, so naming it is never a hit. A whole-action-plus-scene
 * query admitted noise (M12-2); continue and story actions ask nothing.
 */
export function askedFacts(last: Action | undefined, mentioned: readonly Entity[], entities: readonly Entity[], ix: AssertionIndex): Map<string, Assertion[]> {
  const text = last && isPlayerAction(last) ? actionText(last) : '';
  const asked = mentioned.filter((e) => entityNamedIn([e], text));
  if (!asked.length) return new Map();
  const facts = new Map(
    entities.flatMap((e) => {
      const own = new Set(tokenise(namesOf(e).join(' ')));
      return (
        ix
          .of(e.id)
          .filter(factLike)
          // A stance without whom it is towards: naming them hit "respectful colleague" on any "Brother".
          .map(
            (a) =>
              [
                a.id,
                {
                  a,
                  text: tokenise(textOf(a))
                    .filter((w) => !own.has(w))
                    .join(' '),
                },
              ] as const,
          )
      );
    }),
  );
  const index = buildIndex([...facts].map(([id, f]) => ({ id, text: f.text })));
  // Ranked on the words it is admitted by: "the" would favour the longer fact.
  const query = contentTerms(tokenise(text));
  const ok = admitted(index, query);
  const ranked = bm25(index, query).flatMap((id) => (ok.has(id) ? (facts.get(id)?.a ?? []) : []));
  return new Map(asked.map((e) => [e.id, ranked.filter((a) => a.subject === e.id).slice(0, ASKED_FACTS)]));
}
