import { describe, expect, it } from 'vitest';
import { stateTags } from '@core/image/stateTags';

describe('stateTags', () => {
  it('spells posture, condition, mood and what is held as tags', () => {
    expect(stateTags({ posture: 'lying', condition: 'asleep', mood: 'submissive' }, ['a brass horn'], 'sdxl', '')).toBe(
      'lying, on side, sleeping, eyes closed, submissive expression, holding a brass horn',
    );
    expect(stateTags({ posture: 'prone', condition: 'hurt' }, [], 'sdxl', '')).toBe('lying, on stomach, wounded, blood');
    expect(stateTags({ mood: 'submissive' }, [], 'sd15', '')).toBe('submissive');
  });

  it('passes an unknown value through as one tag', () => {
    expect(stateTags({ posture: 'hanging upside down', condition: 'feverish' }, [], 'sdxl', '')).toBe('hanging upside down, feverish');
  });

  it('lets the brief win over the stored posture and mood', () => {
    const states = { posture: 'lying', mood: 'sad' };
    expect(stateTags(states, [], 'sdxl', 'standing by the fire')).toBe('sad expression');
    expect(stateTags(states, [], 'sdxl', 'smiling at the moon')).toBe('lying, on side');
  });
});
