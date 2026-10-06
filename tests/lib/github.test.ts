import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  postPrComment,
  readJobLog,
  readPrDetail,
  readPrDiff,
  readPrRuns,
  readPrTimeline,
  readPullRequests,
  readRunJobs,
  rerunFailedJobs,
  searchPullRequests,
  writePrThread,
  writePrViewed,
} from '@lib/github';
import type { GhResult, PrsSnapshot } from '@shared/github-contract';

/**
 * The renderer's GitHub bridge.
 *
 * Mirrors `lib/jira.ts`: no bridge is the browser demo and not a failure, and a
 * rejected channel is reported to the console rather than thrown at a panel —
 * a rail that crashes because IPC hiccuped is worse than one that says it does
 * not know.
 */

const SNAPSHOT: GhResult<PrsSnapshot> = {
  ok: true,
  value: { prs: [], repos: 2 },
};

afterEach(() => {
  delete window.hive;
  vi.restoreAllMocks();
});

describe('readPullRequests', () => {
  it('answers null when there is no bridge', async () => {
    await expect(readPullRequests()).resolves.toBeNull();
  });

  it('calls the bridge and returns its answer', async () => {
    const prs = vi.fn().mockResolvedValue(SNAPSHOT);
    window.hive = { github: { prs } } as unknown as Window['hive'];

    await expect(readPullRequests()).resolves.toEqual(SNAPSHOT);
    expect(prs).toHaveBeenCalledWith();
  });

  /** A refusal from GitHub is an *answer*, and it is passed straight through. */
  it('passes a refusal through rather than flattening it to null', async () => {
    const refusal: GhResult<PrsSnapshot> = {
      ok: false,
      error: { kind: 'offline', message: 'Could not reach GitHub.' },
    };
    window.hive = {
      github: { prs: vi.fn().mockResolvedValue(refusal) },
    } as unknown as Window['hive'];

    await expect(readPullRequests()).resolves.toEqual(refusal);
  });

  it('answers null and logs once when the channel itself fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.hive = {
      github: { prs: vi.fn().mockRejectedValue(new Error('channel closed')) },
    } as unknown as Window['hive'];

    await expect(readPullRequests()).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

/**
 * The search verb, which has the same three answers as the sweep and one more
 * question of its own: what it forwards.
 */
describe('searchPullRequests', () => {
  it('answers null with no bridge — that is the browser demo', async () => {
    delete window.hive;

    await expect(searchPullRequests('carapace')).resolves.toBeNull();
  });

  it('forwards the term and the project untouched', async () => {
    const searchPrs = vi.fn().mockResolvedValue({ ok: true, value: [] });
    window.hive = { github: { searchPrs } } as unknown as Window['hive'];

    await searchPullRequests('carapace', 'nova-web');

    expect(searchPrs).toHaveBeenCalledWith('carapace', 'nova-web');
  });

  it('omits the project when there is none — main reads that as all of them', async () => {
    const searchPrs = vi.fn().mockResolvedValue({ ok: true, value: [] });
    window.hive = { github: { searchPrs } } as unknown as Window['hive'];

    await searchPullRequests('carapace');

    expect(searchPrs).toHaveBeenCalledWith('carapace', undefined);
  });

  it('passes a refusal through rather than flattening it to null', async () => {
    const refusal = {
      ok: false as const,
      error: { kind: 'offline' as const, message: 'Could not reach GitHub.' },
    };
    window.hive = {
      github: { searchPrs: vi.fn().mockResolvedValue(refusal) },
    } as unknown as Window['hive'];

    await expect(searchPullRequests('carapace')).resolves.toEqual(refusal);
  });

  it('answers null and logs once when the channel itself fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.hive = {
      github: { searchPrs: vi.fn().mockRejectedValue(new Error('channel closed')) },
    } as unknown as Window['hive'];

    await expect(searchPullRequests('carapace')).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('readPrDetail and postPrComment (HIVE-205)', () => {
  const ref = { owner: 'acme', repo: 'web', n: 7 };

  it('answer null with no bridge', async () => {
    await expect(readPrDetail(ref)).resolves.toBeNull();
    await expect(postPrComment({ ...ref, body: 'hi' })).resolves.toBeNull();
  });

  it('pass the request and the answer straight through', async () => {
    const answer = { ok: false, error: { kind: 'no-repos', message: 'acme/web is not a configured project’s repository.' } };
    const prDetail = vi.fn().mockResolvedValue(answer);
    const prComment = vi.fn().mockResolvedValue({ ok: true, value: true });
    window.hive = { github: { prDetail, prComment } } as unknown as Window['hive'];

    await expect(readPrDetail(ref)).resolves.toEqual(answer);
    await expect(postPrComment({ ...ref, body: 'hi' })).resolves.toEqual({ ok: true, value: true });
    expect(prDetail).toHaveBeenCalledWith(ref);
    expect(prComment).toHaveBeenCalledWith({ ...ref, body: 'hi' });
  });

  it('answer null and log once when the channel itself fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.hive = { github: {
      prDetail: vi.fn().mockRejectedValue(new Error('closed')),
      prComment: vi.fn().mockRejectedValue(new Error('closed')),
    } } as unknown as Window['hive'];

    await expect(readPrDetail(ref)).resolves.toBeNull();
    await expect(postPrComment({ ...ref, body: 'hi' })).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe('readPrTimeline (HIVE-208)', () => {
  const ref = { owner: 'acme', repo: 'web', n: 7 };

  it('answers null with no bridge', async () => {
    await expect(readPrTimeline(ref)).resolves.toBeNull();
  });

  it('passes the request and the answer straight through', async () => {
    const answer = { ok: false, error: { kind: 'no-repos', message: 'acme/web is not a configured project’s repository.' } };
    const prTimeline = vi.fn().mockResolvedValue(answer);
    window.hive = { github: { prTimeline } } as unknown as Window['hive'];

    await expect(readPrTimeline(ref)).resolves.toEqual(answer);
    expect(prTimeline).toHaveBeenCalledWith(ref);
  });

  it('answers null and logs once when the channel itself fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.hive = { github: { prTimeline: vi.fn().mockRejectedValue(new Error('closed')) } } as unknown as Window['hive'];

    await expect(readPrTimeline(ref)).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('readPrDiff, writePrThread and writePrViewed (HIVE-207)', () => {
  const ref = { owner: 'acme', repo: 'web', n: 7 };

  it('answer null with no bridge', async () => {
    await expect(readPrDiff(ref)).resolves.toBeNull();
    await expect(writePrThread({ ...ref, threadId: 'T', op: 'resolve' })).resolves.toBeNull();
    await expect(writePrViewed({ ...ref, path: 'a', viewed: true })).resolves.toBeNull();
  });

  it('pass the request through and answer the result', async () => {
    const github = {
      prDiff: vi.fn().mockResolvedValue({ ok: true, value: 'diff' }),
      prThread: vi.fn().mockResolvedValue({ ok: true, value: true }),
      prViewed: vi.fn().mockResolvedValue({ ok: true, value: true }),
    };
    window.hive = { github } as unknown as Window['hive'];

    await expect(readPrDiff(ref)).resolves.toEqual({ ok: true, value: 'diff' });
    await expect(writePrThread({ ...ref, threadId: 'T', op: 'reply', body: 'x' })).resolves.toEqual({ ok: true, value: true });
    await expect(writePrViewed({ ...ref, path: 'a', viewed: false })).resolves.toEqual({ ok: true, value: true });
    expect(github.prDiff).toHaveBeenCalledWith(ref);
    expect(github.prThread).toHaveBeenCalledWith({ ...ref, threadId: 'T', op: 'reply', body: 'x' });
    expect(github.prViewed).toHaveBeenCalledWith({ ...ref, path: 'a', viewed: false });
  });

  it('answer null and log when the channel itself fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.hive = { github: {
      prDiff: vi.fn().mockRejectedValue(new Error('closed')),
      prThread: vi.fn().mockRejectedValue(new Error('closed')),
      prViewed: vi.fn().mockRejectedValue(new Error('closed')),
    } } as unknown as Window['hive'];

    await expect(readPrDiff(ref)).resolves.toBeNull();
    await expect(writePrThread({ ...ref, threadId: 'T', op: 'resolve' })).resolves.toBeNull();
    await expect(writePrViewed({ ...ref, path: 'a', viewed: true })).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(3);
  });
});

describe('the Checks wrappers (HIVE-206)', () => {
  const wrappers = { readPrRuns, readRunJobs, readJobLog, rerunFailedJobs } as const;

  it.each([
    ['readPrRuns', 'prRuns', { owner: 'a', repo: 'b', branch: 'main' }],
    ['readRunJobs', 'runJobs', { owner: 'a', repo: 'b', id: 1 }],
    ['readJobLog', 'jobLog', { owner: 'a', repo: 'b', id: 1 }],
    ['rerunFailedJobs', 'rerunFailed', { owner: 'a', repo: 'b', id: 1 }],
  ] as const)('%s calls the bridge’s %s and answers null when it rejects', async (wrapper, verb, request) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const answer = { ok: true, value: true };
    const call = vi.fn().mockResolvedValueOnce(answer).mockRejectedValueOnce(new Error('ipc'));
    window.hive = { github: { [verb]: call } } as unknown as Window['hive'];
    const fn = wrappers[wrapper] as (r: typeof request) => Promise<unknown>;
    await expect(fn(request)).resolves.toBe(answer);
    await expect(fn(request)).resolves.toBeNull();
    expect(call).toHaveBeenCalledWith(request);
  });

  it('answer null with no bridge', async () => {
    await expect(readPrRuns({ owner: 'a', repo: 'b', branch: 'main' })).resolves.toBeNull();
    await expect(readRunJobs({ owner: 'a', repo: 'b', id: 1 })).resolves.toBeNull();
    await expect(readJobLog({ owner: 'a', repo: 'b', id: 1 })).resolves.toBeNull();
    await expect(rerunFailedJobs({ owner: 'a', repo: 'b', id: 1 })).resolves.toBeNull();
  });
});
