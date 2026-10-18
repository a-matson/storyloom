import { describe, expect, it } from 'vitest';
import { booruTag, countTag, lookTags, placeTag } from '@core/image/tags';

describe('booruTag', () => {
  it.each([
    ['eyes', 'yellow', 'yellow eyes'],
    ['scales', 'gold', 'gold scales'],
    ['hair', 'white mohawk', 'white mohawk hair'],
    ['skin', 'red', 'red skin'],
    ['horns', 'curled', 'curled horns'],
    ['species', 'dragon', 'dragon'],
    ['build', 'massive', 'massive'],
    ['wearing', 'a red cloak', 'wearing a red cloak'],
    ['wearing', 'wearing armour', 'wearing armour'],
    ['marks', 'a scar', 'a scar'],
    ['eyes', 'green eyes', 'green eyes'],
  ])('spells %s %s as "%s" on sdxl', (key, value, out) => expect(booruTag(key, value, 'sdxl')).toBe(out));

  it('keeps key: value on sd15', () => {
    expect(booruTag('eyes', 'yellow', 'sd15')).toBe('eyes: yellow');
    expect(booruTag('eyes', 'green eyes', 'sd15')).toBe('green eyes');
  });

  it('writes the looks body first and skips keys that are not looks', () => {
    expect(lookTags({ eyes: 'yellow', scales: 'gold', species: 'dragon', mood: 'angry' }, 'sdxl')).toBe('dragon, gold scales, yellow eyes');
  });

  it('counts one or two figures on sdxl only', () => {
    expect([0, 1, 2, 3].map((n) => countTag(n, 'sdxl'))).toEqual(['', 'solo', 'duo', '']);
    expect(countTag(1, 'sd15')).toBe('');
  });
});

describe('placeTag', () => {
  it.each([
    ['Halven is a stone keep on a cliff, rain', 'stone keep on a cliff'],
    ['The Iron Gate was a ruined tower.', 'ruined tower'],
    ['A quiet town. Old mills line the river', 'quiet town'],
    ['Halven is where the Duke of Vael rules, a dark city', 'dark city'],
    ['Halven is a vast and ancient city carved into the mountain', ''],
    ['Halven is famous', ''],
    ['', ''],
  ])('reads "%s" as "%s"', (description, out) => expect(placeTag(description)).toBe(out));
});
