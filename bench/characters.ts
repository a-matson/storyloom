import { mergeEntity } from '@core/memory/entities';
import { setValue } from '@core/memory/looks';
import { createBlankAdventure, type Adventure, type Assertion, type Entity } from '@core/model';

/** The builder benches' two characters: one that SD 1.5 drew well, one whose colours it swapped. */
export const CHARS: Record<string, Record<string, string>> = {
  ria: {
    species: 'human woman',
    build: 'slender',
    skin: 'pale skin',
    hair: 'long red braided hair',
    eyes: 'green eyes',
    face: 'freckles',
    wearing: 'blue hooded cloak, brown leather boots',
  },
  vex: {
    species: 'fox anthro',
    build: 'stocky',
    skin: 'orange fur',
    hair: 'short white mohawk hair',
    eyes: 'amber eyes',
    wearing: 'black leather jacket, red scarf',
  },
};

/** An adventure with one answered character; entity id `ent_<name>_<n>`, so `n` picks the portrait seed. */
export function benchAdventure(name: string, n: number): { adv: Adventure; e: Entity; own: Assertion[] } {
  const e = { ...mergeEntity(undefined, { name, kind: 'character', description: '' }, 0), id: `ent_${name}_${n}` };
  const own = Object.entries(CHARS[name] ?? {}).reduce<Assertion[]>((as, [k, v]) => setValue(e, as, k, v, 0), []);
  const adv = createBlankAdventure('Bench', 'x');
  adv.entities = [e];
  adv.assertions = own;
  return { adv, e, own };
}
