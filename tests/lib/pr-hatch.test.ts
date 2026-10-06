import { describe, expect, it } from 'vitest';

import { FLAP_RANK, flapTone, hatchStatus, mergedWords, sortHatchery } from '@lib/pr-hatch';
import type { HatchFacts, HatcheryRow, Pr } from '@/types/pull-request';

/** Local wall-clock times, so the assertions hold in any TZ the suite runs in. */
const local = (month: number, day: number, h: number, m: number) => new Date(2026, month, day, h, m).getTime();
const NOW = local(9, 3, 15, 0); // 3 Oct 2026, 15:00 local

const pr = (over: Partial<Pr> = {}): Pr => ({
  n: 1, repo: 'name', owner: 'owner', title: 't', state: 'open', findings: 0, checks: 'passing',
  url: 'https://github.com/owner/name/pull/1', branch: 'b', session: null,
  updatedAt: '2026-10-03T10:00:00Z', mergedAt: null, mine: true, ...over,
});

describe('mergedWords', () => {
  it('reads today as the time', () => {
    expect(mergedWords(new Date(local(9, 3, 11, 32)).toISOString(), NOW)).toEqual({ at: '11:32', words: 'Merged 11:32' });
  });

  it('reads yesterday with its time', () => {
    expect(mergedWords(new Date(local(9, 2, 18, 10)).toISOString(), NOW)).toEqual({ at: '18:10', words: 'Merged yesterday 18:10' });
  });

  it('reads anything older as a day and month', () => {
    expect(mergedWords(new Date(local(7, 12, 9, 5)).toISOString(), NOW)).toEqual({ at: '09:05', words: 'Merged 12 Aug' });
  });

  it('reads a missing or unreadable time as just Merged', () => {
    expect(mergedWords(null, NOW)).toEqual({ words: 'Merged' });
    expect(mergedWords('not a date', NOW)).toEqual({ words: 'Merged' });
  });
});

describe('sortHatchery', () => {
  const row = (n: number, flap: keyof typeof FLAP_RANK, over: Partial<Pr> = {}): HatcheryRow => ({
    pr: pr({ n, ...over }),
    hatch: { flap, tone: 'muted', github: '', rank: FLAP_RANK[flap], needsYou: flap === 'SUMMONS' },
  });

  it('orders open by flap, then most recently updated; merged after, newest merge first', () => {
    const rows = [
      row(1, 'LARVA'),
      row(2, 'HATCHED', { state: 'merged', mergedAt: '2026-10-03T09:00:00Z' }),
      row(3, 'SUMMONS', { updatedAt: '2026-10-03T08:00:00Z' }),
      row(4, 'MUTATING'),
      row(5, 'SUMMONS', { updatedAt: '2026-10-03T09:00:00Z' }),
      row(6, 'HATCHED', { state: 'merged', mergedAt: '2026-10-03T11:00:00Z' }),
      row(7, 'HATCHING'),
      row(8, 'INCUBATING'),
      row(9, 'COCOONING'),
      row(10, 'BURROWED'),
    ];
    expect(sortHatchery(rows).map((r) => r.pr.n)).toEqual([5, 3, 7, 4, 8, 9, 10, 1, 6, 2]);
  });

  it('does not mutate its input', () => {
    const rows = [row(1, 'LARVA'), row(2, 'SUMMONS')];
    sortHatchery(rows);
    expect(rows.map((r) => r.pr.n)).toEqual([1, 2]);
  });
});

describe('hatchStatus', () => {
  const none: HatchFacts = { stage: null, askedMe: false, mergeWaiting: false };
  const held = (stage: string): HatchFacts => ({ ...none, stage });
  const of = (over: Partial<Pr>, facts = none) => hatchStatus(pr(over), facts, NOW);

  it.each([
    ['1 merged', { state: 'merged', mergedAt: new Date(local(9, 3, 11, 32)).toISOString() }, none, 'HATCHED', 'brand', 'Merged 11:32'],
    ['2 merge waiting', { state: 'approved' }, { ...none, mergeWaiting: true }, 'SUMMONS', 'amber', 'Approved · waiting for your merge'],
    ['2 asked at approval', {}, { ...held('approval'), askedMe: true }, 'SUMMONS', 'amber', 'Open · the shipper asks about the review'],
    ['2 asked elsewhere', { state: 'draft' }, { ...held('self-review'), askedMe: true }, 'SUMMONS', 'amber', 'Draft · the shipper asks you'],
    ['3 intake', { state: 'draft' }, held('intake'), 'COCOONING', 'muted', 'Draft · the shipper took it'],
    ['3 self-review', { state: 'draft' }, held('self-review'), 'COCOONING', 'muted', 'Draft · self review by acr'],
    ['3 fix-self', { state: 'draft' }, held('fix-self'), 'COCOONING', 'muted', 'Draft · fixing the self review'],
    ['4 ci running', { checks: 'running' }, held('ci'), 'INCUBATING', 'green', 'Open · checks running'],
    ['4 ready', {}, held('ready'), 'INCUBATING', 'green', 'Open · being marked ready'],
    ['5 findings', { findings: 3 }, held('findings'), 'MUTATING', 'green', 'Open · 3 open findings, fixer on it'],
    ['5 ci failing', { checks: 'failing' }, held('ci'), 'MUTATING', 'green', 'Open · checks failing, fixer on it'],
    ['6 approval', {}, held('approval'), 'BURROWED', 'muted', 'Open · waiting on review'],
    ['7 merge', { state: 'approved' }, held('merge'), 'HATCHING', 'green', 'Approved · the shipper is merging it'],
    ['8 draft unheld', { state: 'draft', checks: 'failing' }, none, 'LARVA', 'muted', 'Draft · nobody is driving it'],
    ['9 failing', { checks: 'failing' }, none, 'SUMMONS', 'amber', 'Open · checks failing'],
    ['9 findings', { findings: 1 }, none, 'SUMMONS', 'amber', 'Open · 1 open finding'],
    ['9 both', { checks: 'failing', findings: 2 }, none, 'SUMMONS', 'amber', 'Open · checks failing, 2 open findings'],
    ['10 approved', { state: 'approved' }, none, 'SUMMONS', 'amber', 'Approved · waiting for your merge'],
    ['11 running', { checks: 'running' }, none, 'INCUBATING', 'green', 'Open · checks running'],
    ['12 mine', {}, none, 'BURROWED', 'muted', 'Open · waiting on review'],
    ['12 not mine', { mine: false }, none, 'BURROWED', 'muted', 'Open · waits on its author'],
  ] as const)('rule %s', (_name, over, facts, flap, tone, github) => {
    const status = of(over as Partial<Pr>, facts);
    expect(status).toMatchObject({ flap, tone, github, rank: FLAP_RANK[flap], needsYou: flap === 'SUMMONS' });
  });

  it('carries the HATCHED time as at', () => {
    expect(of({ state: 'merged', mergedAt: new Date(local(9, 3, 11, 32)).toISOString() }).at).toBe('11:32');
    expect(of({}).at).toBeUndefined();
  });

  it('gives the first matching rule: merged beats a waiting merge, an ask beats the stage', () => {
    expect(of({ state: 'merged', mergedAt: null }, { ...held('merge'), mergeWaiting: true }).flap).toBe('HATCHED');
    expect(of({ findings: 2 }, { ...held('findings'), askedMe: true }).flap).toBe('SUMMONS');
  });

  it('never summons for someone else\'s PR (rules 2, 9, 10)', () => {
    expect(of({ mine: false, state: 'approved' }, { ...none, mergeWaiting: true, askedMe: true }).flap).not.toBe('SUMMONS');
    expect(of({ mine: false, checks: 'failing', findings: 2 }).flap).toBe('BURROWED');
    expect(of({ mine: false, state: 'approved' }).flap).toBe('BURROWED');
  });

  it('never paints a draft green at any held stage', () => {
    for (const stage of ['intake', 'self-review', 'fix-self', 'ready', 'ci', 'findings', 'approval', 'merge', 'unheard-of']) {
      expect(of({ state: 'draft', checks: 'running', findings: 1 }, held(stage)).tone).not.toBe('green');
    }
  });

  it('reads an unknown stage as rule 12 for a non-draft', () => {
    expect(of({}, held('unheard-of'))).toMatchObject({ flap: 'BURROWED', github: 'Open · waiting on review' });
  });
});

it('flapTone reads the one tone table (HIVE-200)', () => {
  expect(flapTone('SUMMONS')).toBe('amber');
  expect(flapTone('INCUBATING')).toBe('green');
  expect(flapTone('HATCHED')).toBe('brand');
  expect(flapTone('LARVA')).toBe('muted');
});
