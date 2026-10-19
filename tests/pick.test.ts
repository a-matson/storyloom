import { describe, expect, it } from 'vitest';
import { cueFor, pickBeat } from '@core/director';
import { ActionLog } from '@core/log';
import { byPlayer, indexAssertions } from '@core/memory';
import { createBlankAdventure, type Entity } from '@core/model';

const character = (id: string, name: string, beats?: string[]): Entity => ({
  id,
  kind: 'character',
  name,
  aliases: [],
  description: '',
  relations: [],
  firstSeen: 0,
  lastSeen: 1,
  ...(beats && { beats }),
});

/** Oren spoke in the last action; Tamsin never did, so she is the quietest. */
function scene(tamsinBeats?: string[]) {
  const adv = createBlankAdventure('T', 'You wake.');
  adv.entities = [character('ent_t', 'Tamsin', tamsinBeats), character('ent_o', 'Oren')];
  adv.plot = { ...adv.plot, scene: { present: ['ent_t', 'ent_o'] } };
  adv.actions = [...adv.actions, reply('Oren nods.', 'Oren')];
  return adv;
}
const reply = (text: string, speaker?: string) => new ActionLog([]).append('continue', text, speaker ? { speakers: [{ paragraph: 0, name: speaker }] } : {});
const pick = (adv: ReturnType<typeof scene>, ask = '', r = 0) => pickBeat(adv, indexAssertions(adv.assertions), () => r, ask);
const beatOf = (p: ReturnType<typeof pick>) => ('none' in p ? p.none : `${p.entity.name}: ${p.beat}`);

describe('pickBeat', () => {
  it('picks the quietest present character, the beat by `random`', () => {
    expect(beatOf(pick(scene(['joke', 'lie'])))).toBe('Tamsin: joke');
    expect(beatOf(pick(scene(['joke', 'lie']), '', 0.9))).toBe('Tamsin: lie');
    const p = pick(scene(['joke']));
    expect('cue' in p && p.cue).toBe(cueFor('joke', 'Tamsin'));
  });

  it('never picks one of their last 3; a character with none left passes to the next', () => {
    const adv = scene(['joke', 'lie']);
    adv.actions = [...adv.actions, reply(`${cueFor('joke', 'Tamsin')}ha."`)];
    expect(beatOf(pick(adv, '', 0))).toBe('Tamsin: lie');
    adv.entities[0] = { ...adv.entities[0]!, beats: ['joke'] };
    expect(beatOf(pick(adv))).toMatch(/^Oren: /);
  });

  it('acts on the goal only with a confirmed goal', () => {
    const adv = scene(['act on the goal']);
    adv.entities = adv.entities.slice(0, 1);
    expect(beatOf(pick(adv))).toBe('Nobody here has a beat left to play');
    adv.assertions = [{ ...byPlayer('ent_t', 1, { kind: 'goal', text: 'find the key' }), seen: false }];
    expect(beatOf(pick(adv))).toBe('Nobody here has a beat left to play');
    adv.assertions = [byPlayer('ent_t', 1, { kind: 'goal', text: 'find the key' })];
    expect(beatOf(pick(adv))).toBe('Tamsin: act on the goal');
  });

  it('honours `/beat` naming the character, the beat, or both', () => {
    const adv = scene(['joke']);
    expect(beatOf(pick(adv, 'oren lie'))).toBe('Oren: lie');
    expect(beatOf(pick(adv, 'Oren', 0))).toMatch(/^Oren: /);
    expect(beatOf(pick(adv, 'threaten'))).toBe('Tamsin: threaten');
    expect(beatOf(pick(adv, 'Oren dance'))).toBe('No beat "dance" for Oren');
  });

  it('is none with nobody present', () => {
    const adv = scene();
    adv.plot = { ...adv.plot, scene: { present: [] } };
    expect(beatOf(pick(adv))).toBe('Nobody here to act');
  });
});
