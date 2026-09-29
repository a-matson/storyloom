import { describe, expect, it } from 'vitest';
import { ActionLog } from '@core/actionLog';
import { actionText } from '@core/types';

describe('ActionLog', () => {
  it('appends, retries, switches versions and undoes', () => {
    const log = new ActionLog();
    log.append('start', 'Opening.');
    const out = log.append('continue', 'First reply.');
    log.addVersion(out.id, 'Second reply.');
    expect(actionText(log.last!)).toBe('Second reply.');
    expect(log.last!.versions).toHaveLength(2);
    log.setActiveVersion(out.id, 0);
    expect(actionText(log.last!)).toBe('First reply.');
    expect(log.undo()).toBe(true);
    expect(actionText(log.last!)).toBe('Second reply.');
    expect(log.undo()).toBe(true);
    expect(log.last!.versions).toHaveLength(1);
    expect(log.redo()).toBe(true);
    expect(log.last!.versions).toHaveLength(2);
  });

  it('erase and erase-to-here are undoable', () => {
    const log = new ActionLog();
    const a = log.append('start', 'A');
    log.append('continue', 'B');
    const c = log.append('do', '> C');
    log.append('continue', 'D');
    expect(log.eraseTo(c.id).map(actionText)).toEqual(['> C', 'D']);
    expect(log.length).toBe(2);
    log.undo();
    expect(log.length).toBe(4);
    log.erase();
    expect(log.length).toBe(3);
    expect(log.indexOf(a.id)).toBe(0);
  });

  it('edit keeps the old text as a version', () => {
    const log = new ActionLog();
    const a = log.append('continue', 'Typo hear.');
    log.edit(a.id, 'Typo here.');
    expect(log.actions[0]!.versions).toEqual(['Typo hear.', 'Typo here.']);
    expect(actionText(log.actions[0]!)).toBe('Typo here.');
  });

  it('shares unchanged actions between snapshots', () => {
    const log = new ActionLog();
    const a = log.append('start', 'A');
    log.append('continue', 'B');
    const before = log.actions;
    log.append('do', '> C');
    expect(log.actions[0]).toBe(before[0]);
    expect(log.actions[0]).toBe(a);
  });
});
