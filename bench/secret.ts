import { newSecret } from '@core/memory/secrets';
import type { Adventure } from '@core/model';

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
  return { ...adv, assertions: [...adv.assertions, newSecret(Number(at), text, ids)] };
}
