import { describe, expect, it } from 'vitest';

import {
  checkCount,
  checkTime,
  firstLine,
  prFact,
  shipperWords,
  threadLine,
  threadPlace,
} from '@features/pull-requests/session-pr';
import type { PrCheck } from '@shared/github-contract';
import { hatchRow } from '@tests/support/hatchery';

const check = (over: Partial<PrCheck>): PrCheck => ({
  name: 'unit',
  status: 'success',
  startedAt: '2026-10-03T10:00:00Z',
  completedAt: '2026-10-03T10:01:02Z',
  url: null,
  app: null,
  jobId: null,
  ...over,
});
const NOW = Date.parse('2026-10-03T10:02:30Z');

describe('checkCount', () => {
  it('counts finished checks of all of them; running and queued are not finished', () => {
    const checks = [
      check({}),
      check({ status: 'failure' }),
      check({ status: 'neutral' }),
      check({ status: 'running' }),
      check({ status: 'queued' }),
    ];
    expect(checkCount(checks)).toEqual({ done: 3, total: 5 });
    expect(checkCount([])).toEqual({ done: 0, total: 0 });
  });
});

describe('checkTime', () => {
  it('a finished check reads its duration', () => {
    expect(checkTime(check({}), NOW)).toBe('1m 2s');
    expect(checkTime(check({ status: 'failure', completedAt: '2026-10-03T10:00:41Z' }), NOW)).toBe('41s');
  });
  it('a running check reads how long it has run, one unit', () => {
    expect(checkTime(check({ status: 'running', completedAt: null }), NOW)).toBe('running 2m');
    expect(checkTime(check({ status: 'running', startedAt: '2026-10-03T10:02:00Z', completedAt: null }), NOW)).toBe(
      'running 30s',
    );
  });
  it('queued reads queued; a check without times reads nothing', () => {
    expect(checkTime(check({ status: 'queued', startedAt: null, completedAt: null }), NOW)).toBe('queued');
    expect(checkTime(check({ status: 'running', startedAt: null, completedAt: null }), NOW)).toBe('running');
    expect(checkTime(check({ completedAt: null }), NOW)).toBe('');
  });
});

describe('threadPlace / threadLine', () => {
  it('path:line, the original line once outdated, the path alone with no line', () => {
    expect(threadPlace({ path: 'src/a.ts', line: 42, originalLine: 40 })).toBe('src/a.ts:42');
    expect(threadPlace({ path: 'src/a.ts', line: null, originalLine: 40 })).toBe('src/a.ts:40');
    expect(threadPlace({ path: 'src/a.ts', line: null, originalLine: null })).toBe('src/a.ts');
    expect(threadLine({ line: null, originalLine: null })).toBeUndefined();
  });
});

describe('firstLine', () => {
  it('the first non-blank line, trimmed', () => {
    expect(firstLine('\n  Wait on the response.\nMore detail')).toBe('Wait on the response.');
    expect(firstLine('')).toBe('');
  });
});

describe('shipperWords', () => {
  it('took it, plus the hatch reason unless the reason names the shipper', () => {
    expect(shipperWords('Open · checks running')).toBe('took it · checks running');
    expect(shipperWords('Draft · held at ci')).toBe('took it · held at ci');
    expect(shipperWords('Open · the shipper took it')).toBe('took it');
    expect(shipperWords('Open · the shipper is merging it')).toBe('took it');
    expect(shipperWords('Open')).toBe('took it');
  });
});

describe('prFact', () => {
  it("the number and GitHub's words, or last seen for a remembered PR", () => {
    const row = hatchRow({ n: 313 }, { github: 'Open · checks running' });
    expect(prFact({ n: 313, state: 'open', url: row.pr.url }, row)).toBe('#313 · Open · checks running');
    expect(prFact({ n: 298, url: 'https://github.com/a/b/pull/298' }, null)).toBe('#298 · last seen');
  });
});
