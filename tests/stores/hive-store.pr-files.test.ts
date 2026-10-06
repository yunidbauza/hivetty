import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_ERROR } from '@lib/utils';
import {
  PR_DETAIL_CAP,
  useHiveStore,
  useLoadPrDiff,
  useParsedPrDiff,
  usePrDiff,
  usePrThreadActions,
  useSetPrFileViewed,
} from '@stores/hive-store';

import { prDetail, prFile } from '../support/pr-detail';
import { prRecord } from '../support/prs';

/** The Files tab's slices (HIVE-207). `lib/github` is mocked: what is under test is how each answer lands. */

const readPrDetail = vi.fn();
const readPrDiff = vi.fn();
const writePrThread = vi.fn();
const writePrViewed = vi.fn();

vi.mock('@lib/github', () => ({
  readPullRequests: () => Promise.resolve(null),
  searchPullRequests: () => Promise.resolve(null),
  readPrDetail: (request: unknown) => readPrDetail(request),
  postPrComment: () => Promise.resolve(null),
  readPrDiff: (request: unknown) => readPrDiff(request),
  writePrThread: (request: unknown) => writePrThread(request),
  writePrViewed: (request: unknown) => writePrViewed(request),
}));

const state = () => useHiveStore.getState();
const ok = <T,>(value: T) => ({ ok: true as const, value });
const refused = (message: string) => ({ ok: false as const, error: { kind: 'unknown' as const, message } });
const KEY = 'acme/nova-web#482';

beforeEach(() => {
  vi.clearAllMocks();
  state().reset();
});

describe('loadPrDiff (HIVE-207)', () => {
  it('is loading at the sha until the read lands, then ok with the text', async () => {
    let land!: (value: unknown) => void;
    readPrDiff.mockReturnValue(new Promise((done) => { land = done; }));
    const pending = state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    expect(state().prDiffs[KEY]).toEqual({ key: KEY, sha: 'abc', state: 'loading' });
    expect(readPrDiff).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', n: 482 });
    land(ok('diff --git a/x b/x'));
    await pending;
    expect(state().prDiffs[KEY]).toEqual({ key: KEY, sha: 'abc', state: 'ok', text: 'diff --git a/x b/x' });
  });

  it('does not read again at the same sha, and reads again at a new one keeping the old text meanwhile', async () => {
    readPrDiff.mockResolvedValue(ok('one'));
    await state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    await state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    expect(readPrDiff).toHaveBeenCalledTimes(1);

    let land!: (value: unknown) => void;
    readPrDiff.mockReturnValue(new Promise((done) => { land = done; }));
    const pending = state().loadPrDiff('acme', 'nova-web', 482, 'def');
    expect(state().prDiffs[KEY]).toMatchObject({ sha: 'def', state: 'loading', text: 'one' });
    land(ok('two'));
    await pending;
    expect(state().prDiffs[KEY]).toMatchObject({ sha: 'def', state: 'ok', text: 'two' });
  });

  it('keeps the text beside the problem on a failure, and retries a failed read at the same sha', async () => {
    readPrDiff.mockResolvedValueOnce(ok('one')).mockResolvedValueOnce(refused('diff too large'));
    await state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    await state().loadPrDiff('acme', 'nova-web', 482, 'def');
    expect(state().prDiffs[KEY]).toMatchObject({ state: 'failed', problem: 'diff too large', text: 'one' });
    readPrDiff.mockResolvedValueOnce(ok('two'));
    await state().loadPrDiff('acme', 'nova-web', 482, 'def');
    expect(state().prDiffs[KEY]).toMatchObject({ state: 'ok', text: 'two' });
  });

  it('says the bridge is missing with no bridge', async () => {
    readPrDiff.mockResolvedValue(null);
    await state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    expect(state().prDiffs[KEY]).toMatchObject({ state: 'failed', problem: BRIDGE_ERROR });
  });

  it('drops an answer for an older sha', async () => {
    let first!: (value: unknown) => void;
    readPrDiff.mockReturnValueOnce(new Promise((done) => { first = done; })).mockResolvedValueOnce(ok('new'));
    const old = state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    await state().loadPrDiff('acme', 'nova-web', 482, 'def');
    first(ok('old'));
    await old;
    expect(state().prDiffs[KEY]).toMatchObject({ sha: 'def', text: 'new' });
  });

  it('holds at most PR_DETAIL_CAP diffs, and reset clears them', async () => {
    readPrDiff.mockResolvedValue(ok('x'));
    for (let n = 1; n <= PR_DETAIL_CAP + 1; n += 1) await state().loadPrDiff('acme', 'nova-web', n, 'abc');
    expect(Object.keys(state().prDiffs)).toHaveLength(PR_DETAIL_CAP);
    expect(state().prDiffs['acme/nova-web#1']).toBeUndefined();
    state().reset();
    expect(state().prDiffs).toEqual({});
  });

  it('is dropped when its PR leaves the sweep, and kept on a quiet sweep', async () => {
    readPrDiff.mockResolvedValue(ok('x'));
    state().hydratePrs([prRecord({ number: 482 }), prRecord({ number: 483 })], 1);
    await state().loadPrDiff('acme', 'nova-web', 482, 'abc');
    await state().loadPrDiff('acme', 'nova-web', 483, 'abc');
    const before = state().prDiffs;
    state().hydratePrs([prRecord({ number: 482 }), prRecord({ number: 483 })], 1);
    expect(state().prDiffs).toBe(before);

    state().hydratePrs([prRecord({ number: 483 })], 1);
    expect(Object.keys(state().prDiffs)).toEqual(['acme/nova-web#483']);
  });
});

const seed = (files = [prFile({ path: 'a.ts', viewed: 'unviewed' }), prFile({ path: 'b.ts', viewed: 'dismissed' })]) =>
  useHiveStore.setState({ prDetails: { [KEY]: { key: KEY, state: 'ok', detail: prDetail({ owner: 'acme', repo: 'nova-web', number: 482, files }) } } });

describe('thread writes (HIVE-207)', () => {
  it('replies, then reloads the detail', async () => {
    writePrThread.mockResolvedValue(ok(true));
    readPrDetail.mockResolvedValue(ok(prDetail()));
    await expect(state().replyToPrThread('acme', 'nova-web', 482, 'T', 'On it')).resolves.toEqual(ok(true));
    expect(writePrThread).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', n: 482, threadId: 'T', op: 'reply', body: 'On it' });
    expect(readPrDetail).toHaveBeenCalledTimes(1);
  });

  it.each([[true, 'resolve'], [false, 'unresolve']] as const)('resolved=%s sends %s, then reloads', async (resolved, op) => {
    writePrThread.mockResolvedValue(ok(true));
    readPrDetail.mockResolvedValue(ok(prDetail()));
    await state().setPrThreadResolved('acme', 'nova-web', 482, 'T', resolved);
    expect(writePrThread).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', n: 482, threadId: 'T', op });
    expect(readPrDetail).toHaveBeenCalledTimes(1);
  });

  it('answers a refusal and still reloads', async () => {
    writePrThread.mockResolvedValue(refused('not on this PR'));
    readPrDetail.mockResolvedValue(ok(prDetail()));
    await expect(state().setPrThreadResolved('acme', 'nova-web', 482, 'T', true)).resolves.toEqual(refused('not on this PR'));
    expect(readPrDetail).toHaveBeenCalledTimes(1);
  });

  it('answers the bridge error with no bridge', async () => {
    writePrThread.mockResolvedValue(null);
    readPrDetail.mockResolvedValue(null);
    await expect(state().replyToPrThread('acme', 'nova-web', 482, 'T', 'x')).resolves.toEqual({
      ok: false, error: { kind: 'unknown', message: BRIDGE_ERROR },
    });
  });
});

describe('setPrFileViewed (HIVE-207)', () => {
  const viewedOf = (path: string) => state().prDetails[KEY]?.detail?.files.find((f) => f.path === path)?.viewed;

  it('shows the mark at once, before GitHub answers', async () => {
    seed();
    let land!: (value: unknown) => void;
    writePrViewed.mockReturnValue(new Promise((done) => { land = done; }));
    readPrDetail.mockReturnValue(new Promise(() => undefined));
    const pending = state().setPrFileViewed('acme', 'nova-web', 482, 'a.ts', true);
    expect(viewedOf('a.ts')).toBe('viewed');
    expect(writePrViewed).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', n: 482, path: 'a.ts', viewed: true });
    land(ok(true));
    void pending;
  });

  it('unmarks a dismissed file to unviewed', async () => {
    seed();
    writePrViewed.mockResolvedValue(ok(true));
    readPrDetail.mockReturnValue(new Promise(() => undefined));
    void state().setPrFileViewed('acme', 'nova-web', 482, 'b.ts', false);
    expect(viewedOf('b.ts')).toBe('unviewed');
  });

  it('rolls the one file back on a refusal and answers the reason', async () => {
    seed();
    writePrViewed.mockResolvedValue(refused('Resource not accessible'));
    readPrDetail.mockReturnValue(new Promise(() => undefined));
    void state().setPrFileViewed('acme', 'nova-web', 482, 'b.ts', true);
    expect(viewedOf('b.ts')).toBe('viewed');
    await vi.waitFor(() => expect(viewedOf('b.ts')).toBe('dismissed'));
    expect(viewedOf('a.ts')).toBe('unviewed');
  });

  it('reloads the detail after, success or not', async () => {
    seed();
    writePrViewed.mockResolvedValueOnce(ok(true)).mockResolvedValueOnce(refused('no'));
    readPrDetail.mockResolvedValue(ok(prDetail({ owner: 'acme', repo: 'nova-web', number: 482, files: [prFile({ path: 'a.ts', viewed: 'viewed' })] })));
    await expect(state().setPrFileViewed('acme', 'nova-web', 482, 'a.ts', true)).resolves.toEqual(ok(true));
    await expect(state().setPrFileViewed('acme', 'nova-web', 482, 'a.ts', false)).resolves.toEqual(refused('no'));
    expect(readPrDetail).toHaveBeenCalledTimes(2);
  });

  it('writes even with no detail loaded, and patches nothing', async () => {
    writePrViewed.mockResolvedValue(ok(true));
    readPrDetail.mockResolvedValue(null);
    await expect(state().setPrFileViewed('acme', 'nova-web', 482, 'a.ts', true)).resolves.toEqual(ok(true));
  });
});

describe('the Files selectors (HIVE-207)', () => {
  const TEXT = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n';

  it('reads the entry and parses the diff once per text', () => {
    useHiveStore.setState({ prDiffs: { [KEY]: { key: KEY, sha: 'abc', state: 'ok', text: TEXT } } });
    expect(renderHook(() => usePrDiff(KEY)).result.current).toMatchObject({ sha: 'abc', state: 'ok' });
    const { result, rerender } = renderHook(() => useParsedPrDiff(KEY));
    const first = result.current;
    expect(first?.[0]?.path).toBe('x');
    rerender();
    expect(result.current).toBe(first);
  });

  it('is null before there is text', () => {
    const { result } = renderHook(() => useParsedPrDiff(KEY));
    expect(result.current).toBeNull();
  });

  it('hands out the actions', () => {
    const { result } = renderHook(() => ({ load: useLoadPrDiff(), thread: usePrThreadActions(), viewed: useSetPrFileViewed() }));
    expect(result.current.load).toBe(state().loadPrDiff);
    expect(result.current.thread.reply).toBe(state().replyToPrThread);
    expect(result.current.thread.setResolved).toBe(state().setPrThreadResolved);
    expect(result.current.viewed).toBe(state().setPrFileViewed);
  });
});
