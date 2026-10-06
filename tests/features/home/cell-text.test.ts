import { describe, expect, it } from 'vitest';

import type { CombCell } from '@lib/swarm/comb';
import type { CombEntity } from '@stores/hive-store';
import { cellLabel, cellLine, cellText, waitText } from '@features/home/cell-text';

const entity = (over: Partial<CombEntity>): CombEntity => ({
  id: 'x', name: 'x', kind: 'session', project: 'p1', state: 'burrowed', status: 'idle', ...over,
});
const cellFor = (over: Partial<CombCell>): CombCell => ({
  id: 'x', kind: 'entity', name: 'x', project: 'p1', state: 'burrowed', x: 0, y: 0, phase: 0, ...over,
});
const names = (id: string) => ({ p1: 'the-hive' })[id] ?? id;
const NOW = 1_000_000_000;

describe('cellLine', () => {
  it('words a session by its status, with its plan', () => {
    expect(cellLine(entity({ status: 'working', state: 'morphing', done: 3, total: 4 }))).toBe('working · 3 of 4');
    expect(cellLine(entity({ status: 'waiting', state: 'summons' }))).toBe('needs input');
    expect(cellLine(entity({ status: 'idle', idleDetail: 'agents', state: 'morphing' }))).toMatch(/^working \(/);
  });

  it('words a terminal by its prompt', () => {
    expect(cellLine(entity({ kind: 'terminal', status: 'prompt', state: 'terminal' }))).toBe('at prompt');
  });

  it('words an agent by its ask, its failure or its next wake', () => {
    expect(cellLine(entity({ kind: 'agent', status: 'asking', state: 'summons', ask: 'Merge #305?' }))).toBe('Merge #305?');
    expect(cellLine(entity({ kind: 'agent', status: 'failed', state: 'failed', reason: 'hit the limit' }))).toBe('hit the limit');
    expect(cellLine(entity({ kind: 'agent', status: 'working', state: 'morphing' }))).toBe('working');
    expect(cellLine(entity({ kind: 'agent', status: 'paused', state: 'burrowed', nextRun: 'paused' }))).toBe('paused');
    expect(cellLine(entity({ kind: 'agent', status: 'sleeping', state: 'burrowed', nextRun: 'manual' }))).toBe('asleep');
    expect(cellLine(entity({ kind: 'agent', status: 'sleeping', state: 'burrowed', nextRun: '16:00' }))).toBe('next run 16:00');
  });
});

describe('waitText', () => {
  it('reads in minutes, then hours', () => {
    expect(waitText(NOW - 14 * 60_000, NOW)).toBe('14m');
    expect(waitText(NOW - 10_000, NOW)).toBe('1m');
    expect(waitText(NOW - 135 * 60_000, NOW)).toBe('2h 15m');
  });
});

describe('cellText', () => {
  it('names a session cell with its state word and project', () => {
    const e = entity({ name: 'Alpha', status: 'working', state: 'morphing' });
    expect(cellText(cellFor({ state: 'morphing' }), e, names, NOW)).toEqual({
      title: 'Alpha', word: 'Morphing', state: 'morphing', context: 'the-hive', line: 'working',
    });
  });

  it("adds an asking agent's wait", () => {
    const e = entity({ kind: 'agent', project: 'swarm', status: 'asking', state: 'summons', ask: 'Merge?', askedAt: NOW - 14 * 60_000 });
    expect(cellText(cellFor({ project: 'swarm', state: 'summons' }), e, names, NOW).context).toBe('agent · 14m');
  });

  it('describes rest cells by where they lead', () => {
    expect(cellText(cellFor({ kind: 'rest', state: 'rest', more: 3, project: 'p1' }), undefined, names, NOW))
      .toEqual({ title: '3 more in the-hive', context: '', line: 'click to open the project' });
    expect(cellText(cellFor({ kind: 'rest', state: 'rest', more: 2, project: '*' }), undefined, names, NOW).title).toBe('2 more projects');
    expect(cellText(cellFor({ kind: 'rest', state: 'rest', more: 4, project: 'swarm' }), undefined, names, NOW).line).toBe('click to open Agents');
  });

  it('reads as one line for a screen reader', () => {
    expect(cellLabel({ title: 'Alpha', word: 'Morphing', state: 'morphing', context: 'the-hive', line: 'working' }))
      .toBe('Alpha, Morphing · the-hive, working');
  });
});
