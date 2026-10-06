import type { HatchStatus, HatcheryRow, Pr } from '@/types/pull-request';

/** A resolved PR with every field defaulted (HIVE-205). */
export function fixturePr(overrides: Partial<Pr> = {}): Pr {
  return {
    n: 1182,
    repo: 'incorpx-server',
    owner: 'acme',
    title: 'Fee rule validator for Delaware filings',
    state: 'open',
    findings: 0,
    checks: 'passing',
    url: 'https://github.com/acme/incorpx-server/pull/1182',
    branch: 'feat/incorp-598-fee-rule',
    session: null,
    mergedAt: null,
    mine: true,
    updatedAt: '2026-10-03T10:00:00Z',
    ...overrides,
  };
}

export function fixtureHatch(overrides: Partial<HatchStatus> = {}): HatchStatus {
  return { flap: 'BURROWED', tone: 'muted', github: 'Open · waiting on review', rank: 5, needsYou: false, ...overrides };
}

export const hatchRow = (pr: Partial<Pr> = {}, hatch: Partial<HatchStatus> = {}): HatcheryRow => ({
  pr: fixturePr(pr),
  hatch: fixtureHatch(hatch),
});
