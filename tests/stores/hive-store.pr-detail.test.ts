import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_ERROR } from '@lib/utils';
import type { PrDetail } from '@shared/github-contract';
import { PR_DETAIL_CAP, prKey, useHiveStore } from '@stores/hive-store';

import { prRecord } from '../support/prs';

/**
 * The PR detail slice (HIVE-205). `lib/github` is mocked: what is under test is
 * how an answer lands, that a failed refresh keeps what was read, the cap, the
 * drop when a PR leaves the sweep, and the comment's reload.
 */

const readPrDetail = vi.fn();
const postPrComment = vi.fn();

vi.mock('@lib/github', () => ({
  readPullRequests: () => Promise.resolve(null),
  searchPullRequests: () => Promise.resolve(null),
  readPrDetail: (request: unknown) => readPrDetail(request),
  postPrComment: (request: unknown) => postPrComment(request),
  readPrDiff: () => Promise.resolve(null),
  writePrThread: () => Promise.resolve(null),
  writePrViewed: () => Promise.resolve(null),
}));

const state = () => useHiveStore.getState();
const detail = (n: number): PrDetail => ({
  id: `PR_${n}`, owner: 'acme', repo: 'nova-web', number: n, title: 'Hero', url: `https://github.com/acme/nova-web/pull/${n}`,
  state: 'open', isDraft: false, body: '', createdAt: '2026-10-03T08:00:00Z', mergedAt: null,
  baseRef: 'main', headRef: 'feat/x', headSha: 'abc', additions: 1, deletions: 0, changedFiles: 1,
  author: 'octocat', reviewDecision: null, mergeStateStatus: null,
  comments: [], reviews: [], reviewRequests: [], threads: [], checks: [], files: [],
});
const ok = <T,>(value: T) => ({ ok: true as const, value });
const refused = (message: string) => ({ ok: false as const, error: { kind: 'unknown' as const, message } });
const KEY = 'acme/nova-web#482';

beforeEach(() => {
  vi.clearAllMocks();
  state().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('prKey', () => {
  it('is owner/repo#n, lowercased', () => {
    expect(prKey('Acme', 'Nova-Web', 482)).toBe(KEY);
  });
});

describe('loadPrDetail (HIVE-205)', () => {
  it('is loading until the read lands, then ok with the time it was read', async () => {
    vi.useFakeTimers({ now: 1_000 });
    let land!: (value: unknown) => void;
    readPrDetail.mockReturnValue(new Promise((done) => { land = done; }));

    const pending = state().loadPrDetail('Acme', 'nova-web', 482);
    expect(state().prDetails[KEY]).toEqual({ key: KEY, state: 'loading' });
    expect(readPrDetail).toHaveBeenCalledWith({ owner: 'Acme', repo: 'nova-web', n: 482 });

    land(ok(detail(482)));
    await pending;
    expect(state().prDetails[KEY]).toEqual({ key: KEY, state: 'ok', detail: detail(482), readAt: 1_000 });
  });

  it('fails with the reason, and a failed refresh keeps the last detail', async () => {
    readPrDetail.mockResolvedValueOnce(refused('first'));
    await state().loadPrDetail('acme', 'nova-web', 482);
    expect(state().prDetails[KEY]).toMatchObject({ state: 'failed', problem: 'first' });
    expect(state().prDetails[KEY]?.detail).toBeUndefined();

    readPrDetail.mockResolvedValueOnce(ok(detail(482)));
    await state().loadPrDetail('acme', 'nova-web', 482);
    readPrDetail.mockResolvedValueOnce(null);
    await state().loadPrDetail('acme', 'nova-web', 482);
    expect(state().prDetails[KEY]).toMatchObject({ state: 'failed', problem: BRIDGE_ERROR, detail: detail(482) });
  });

  it('holds at most PR_DETAIL_CAP, the newest last', async () => {
    readPrDetail.mockImplementation(({ n }: { n: number }) => Promise.resolve(ok(detail(n))));
    for (let n = 1; n <= PR_DETAIL_CAP + 1; n += 1) await state().loadPrDetail('acme', 'nova-web', n);
    const keys = Object.keys(state().prDetails);
    expect(keys).toHaveLength(PR_DETAIL_CAP);
    expect(keys[0]).toBe('acme/nova-web#2');
    expect(keys.at(-1)).toBe(`acme/nova-web#${PR_DETAIL_CAP + 1}`);
  });

  it('drops an answer for a key cleared meanwhile', async () => {
    let land!: (value: unknown) => void;
    readPrDetail.mockReturnValue(new Promise((done) => { land = done; }));
    const pending = state().loadPrDetail('acme', 'nova-web', 482);
    useHiveStore.setState({ prDetails: {} });
    land(ok(detail(482)));
    await pending;
    expect(state().prDetails[KEY]).toBeUndefined();
  });
});

describe('a PR leaving the sweep (HIVE-205)', () => {
  it('drops its detail, and keeps one for a PR never in the sweep', async () => {
    readPrDetail.mockImplementation(({ n }: { n: number }) => Promise.resolve(ok(detail(n))));
    state().hydratePrs([prRecord({ number: 482 }), prRecord({ number: 483 })], 1);
    await state().loadPrDetail('acme', 'nova-web', 482);
    await state().loadPrDetail('acme', 'nova-web', 483);
    await state().loadPrDetail('acme', 'nova-web', 9);

    state().hydratePrs([prRecord({ number: 483 })], 1);
    expect(Object.keys(state().prDetails)).toEqual(['acme/nova-web#483', 'acme/nova-web#9']);
  });

  it('leaves the map untouched on a quiet sweep', async () => {
    readPrDetail.mockResolvedValue(ok(detail(482)));
    state().hydratePrs([prRecord({ number: 482 })], 1);
    await state().loadPrDetail('acme', 'nova-web', 482);
    const before = state().prDetails;
    state().hydratePrs([prRecord({ number: 482 })], 1);
    expect(state().prDetails).toBe(before);
  });

  it('is cleared by reset', async () => {
    readPrDetail.mockResolvedValue(ok(detail(482)));
    await state().loadPrDetail('acme', 'nova-web', 482);
    state().reset();
    expect(state().prDetails).toEqual({});
  });
});

describe('commentOnPr (HIVE-205)', () => {
  it('posts, then reloads the detail', async () => {
    postPrComment.mockResolvedValue(ok(true));
    readPrDetail.mockResolvedValue(ok(detail(482)));
    await expect(state().commentOnPr('acme', 'nova-web', 482, 'LGTM')).resolves.toEqual(ok(true));
    expect(postPrComment).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', n: 482, body: 'LGTM' });
    expect(state().prDetails[KEY]?.state).toBe('ok');
  });

  it('answers the refusal and reloads nothing', async () => {
    postPrComment.mockResolvedValue(refused('rate limited'));
    await expect(state().commentOnPr('acme', 'nova-web', 482, 'LGTM')).resolves.toEqual(refused('rate limited'));
    expect(readPrDetail).not.toHaveBeenCalled();
  });

  it('answers the bridge error with no bridge', async () => {
    postPrComment.mockResolvedValue(null);
    await expect(state().commentOnPr('acme', 'nova-web', 482, 'LGTM')).resolves.toEqual({
      ok: false,
      error: { kind: 'unknown', message: BRIDGE_ERROR },
    });
  });
});
