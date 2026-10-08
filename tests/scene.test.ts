import { describe, expect, it } from 'vitest';
import { renderScene } from '@core/context/render';
import { advanceTime, nextScene } from '@core/memory/scene';
import type { ExtractionJson, Scene } from '@core/model/types';

const reply = (over: Partial<ExtractionJson> = {}): ExtractionJson => ({
  timeDelta: { days: 0, parts: 0 },
  entities: [],
  speakers: [],
  ...over,
});
const isName = (n: string) => n !== '' && n.toLowerCase() !== 'you';
const night3: Scene = { location: 'the mill', present: ['Lena'], time: { day: 3, part: 'night' } };

describe('the in-story clock', () => {
  it('wraps parts through the day and carries into the day count', () => {
    expect(advanceTime({ day: 1, part: 'evening' }, { parts: 1 })).toEqual({ day: 1, part: 'night' });
    expect(advanceTime({ day: 1, part: 'night' }, { parts: 2 })).toEqual({ day: 2, part: 'morning' });
    expect(advanceTime({ day: 1, part: 'morning' }, { days: 2 })).toEqual({ day: 3, part: 'morning' });
    expect(advanceTime({ day: 1, part: 'dawn' }, { days: 1, parts: 13 })).toEqual({ day: 4, part: 'morning' });
    expect(advanceTime({ day: 1, part: 'dawn' }, { parts: -3 })).toEqual({ day: 1, part: 'dawn' });
    const t = { day: 2, part: 'evening' } as const;
    expect(advanceTime(t, { days: 0, parts: 0 })).toBe(t);
  });

  it('does not move without a stated delta, even when the passage names a time of day', () => {
    const next = nextScene(night3, reply({ scene: { timeOfDay: 'morning' } }), isName);
    expect(next).toBe(night3);
  });

  it('starts the clock on day 1 from a stated time of day', () => {
    expect(nextScene(undefined, reply({ scene: { timeOfDay: 'evening' } }), isName)?.time).toEqual({ day: 1, part: 'evening' });
    expect(nextScene(undefined, reply({ timeDelta: { days: 2, parts: 0 } }), isName)).toBeUndefined();
  });
});

describe('nextScene', () => {
  it('moves to a named place with the cast the reply names, dropping the player', () => {
    const next = nextScene(
      night3,
      reply({ timeDelta: { days: 0, parts: 1 }, scene: { location: "Blackmore's study", present: ['Morrow', 'You', ' '] } }),
      isName,
    );
    expect(next).toEqual({ location: "Blackmore's study", present: ['Morrow'], time: { day: 4, part: 'dawn' } });
  });

  it('keeps the place, the player-set cast and weather when the reply omits them', () => {
    const scene: Scene = { ...night3, weather: 'Fog' };
    expect(nextScene(scene, reply({ scene: { location: ' ', present: [] } }), isName)).toBe(scene);
    expect(nextScene(scene, reply({ scene: { weather: 'rain' } }), isName)).toEqual({ ...scene, weather: 'rain' });
  });
});

describe('renderScene', () => {
  it('writes one line and leaves out what is unknown', () => {
    expect(renderScene({ ...night3, present: ['Lena', 'Morrow'], weather: 'rain' })).toBe('the mill · Present: Lena, Morrow · Night, day 3 · Rain');
    expect(renderScene({ present: [], time: { day: 1, part: 'dawn' } })).toBe('Dawn, day 1');
    expect(renderScene({ present: [] })).toBe('');
    expect(renderScene(undefined)).toBe('');
  });
});
