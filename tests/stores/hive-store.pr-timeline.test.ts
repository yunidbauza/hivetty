import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_ERROR } from '@lib/utils';
import type { PrTimeline } from '@shared/github-contract';
import type { LedgerEntry } from '@shared/ledger-contract';
import { ledgerIdAt, PR_DETAIL_CAP, useHiveStore } from '@stores/hive-store';

/** The Timeline slice (HIVE-208). `lib/github` is mocked; what is under test is how answers land. */

const readPrTimeline = vi.fn();
vi.mock('@lib/github', () => ({
  readPullRequests: () => Promise.resolve(null),
  searchPullRequests: () => Promise.resolve(null),
  readPrDetail: () => Promise.resolve(null),
  readPrTimeline: (r: unknown) => readPrTimeline(r),
  postPrComment: () => Promise.resolve(null),
  readPrRuns: () => Promise.resolve(null),
  readRunJobs: () => Promise.resolve(null),
  readJobLog: () => Promise.resolve(null),
  rerunFailedJobs: () => Promise.resolve(null),
  readPrDiff: () => Promise.resolve(null),
  writePrThread: () => Promise.resolve(null),
  writePrViewed: () => Promise.resolve(null),
}));

const list = vi.fn();
const state = () => useHiveStore.getState();
const ok = <T,>(value: T) => ({ ok: true as const, value });
const refused = (message: string) => ({ ok: false as const, error: { kind: 'unknown' as const, message } });
const entry = (id: string): LedgerEntry => ({ id, ts: 0, from: 'shipper', kind: 'post', body: '' });
const timeline: PrTimeline = {
  createdAt: '2026-10-03T11:00:00Z', mergedAt: null, isDraft: false,
  commits: [], runs: [], reviews: [], comments: [], events: [],
};
const KEY = 'acme/server#1182';

let hive: unknown;
beforeEach(() => {
  vi.clearAllMocks();
  state().reset();
  hive = window.hive;
  (window as unknown as { hive: unknown }).hive = { ledger: { list } };
});
afterEach(() => {
  (window as unknown as { hive: unknown }).hive = hive;
});

describe('loadPrTimeline (HIVE-208)', () => {
  it('reads the timeline, then the ledger history once from a day before the PR opened', async () => {
    readPrTimeline.mockResolvedValue(ok(timeline));
    list.mockResolvedValue({ entries: [entry('20261003-110500-0001')] });
    await state().loadPrTimeline('Acme', 'server', 1182);
    await state().loadPrTimeline('acme', 'server', 1182);
    expect(readPrTimeline).toHaveBeenCalledWith({ owner: 'Acme', repo: 'server', n: 1182 });
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ since: ledgerIdAt(Date.parse(timeline.createdAt) - 86_400_000) });
    expect(state().prTimelines[KEY]).toMatchObject({ state: 'ok', timeline, history: [{ id: '20261003-110500-0001' }] });
  });

  it('keeps what it read beside the problem when a refresh fails, and says so with no bridge', async () => {
    readPrTimeline.mockResolvedValueOnce(ok(timeline)).mockResolvedValueOnce(refused('offline')).mockResolvedValueOnce(null);
    list.mockRejectedValue(new Error('gone'));
    await state().loadPrTimeline('acme', 'server', 1182);
    await state().loadPrTimeline('acme', 'server', 1182);
    expect(state().prTimelines[KEY]).toMatchObject({ state: 'failed', problem: 'offline', timeline });
    await state().loadPrTimeline('acme', 'server', 1182);
    expect(state().prTimelines[KEY]?.problem).toBe(BRIDGE_ERROR);
  });

  it('drops an answer for a PR evicted meanwhile', async () => {
    let answer: (v: unknown) => void = () => undefined;
    readPrTimeline.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; })).mockResolvedValue(ok(timeline));
    list.mockResolvedValue({ entries: [] });
    const first = state().loadPrTimeline('acme', 'server', 1);
    for (let n = 2; n <= PR_DETAIL_CAP + 1; n += 1) await state().loadPrTimeline('acme', 'server', n);
    answer(ok(timeline));
    await first;
    expect(state().prTimelines['acme/server#1']).toBeUndefined();
    expect(Object.keys(state().prTimelines)).toHaveLength(PR_DETAIL_CAP);
  });

  it('formats a ledger id in local time', () => {
    expect(ledgerIdAt(new Date(2026, 9, 3, 9, 5, 7).getTime())).toBe('20261003-090507');
  });
});
