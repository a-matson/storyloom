import { newSecret } from '@core/memory/secrets';
import { actionText, type Adventure } from '@core/model';

/**
 * `MEASURE_SECRET="<at>|<gist>|<name>,<name>"`: marks a secret on a backup as the player would, known
 * to you and the named characters. Unset: the adventure as it is.
 */
export function withSecret(adv: Adventure): Adventure {
  const spec = process.env['MEASURE_SECRET'];
  if (!spec) return adv;
  const [at = '', text = '', names = ''] = spec.split('|');
  const ids = names
    .split(',')
    .filter(Boolean)
    .map((n) => {
      const e = adv.entities.find((x) => x.name === n.trim());
      if (!e) throw new Error(`MEASURE_SECRET: no entity named ${n}`);
      return e.id;
    });
  // Replaces a mark already on that action: the M17 dogfood widened its knowers by hand at #173.
  const action = adv.actions[Number(at)];
  const kept = adv.assertions.filter((a) => a.kind !== 'secret' || a.at !== Number(at));
  return { ...adv, assertions: [...kept, newSecret(Number(at), text, ids, action ? actionText(action) : '')] };
}
