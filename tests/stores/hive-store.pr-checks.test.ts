import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_ERROR } from '@lib/utils';
import type { RunJob, WorkflowRun } from '@shared/github-contract';
import { PR_DETAIL_CAP, useHiveStore } from '@stores/hive-store';

import { prRecord } from '../support/prs';

/** The Checks slice (HIVE-206). `lib/github` is mocked; what is under test is how answers land. */

const readPrRuns = vi.fn();
const readRunJobs = vi.fn();
const readJobLog = vi.fn();
const rerunFailedJobs = vi.fn();
vi.mock('@lib/github', () => ({
  readPullRequests: () => Promise.resolve(null),
  searchPullRequests: () => Promise.resolve(null),
  readPrDetail: () => Promise.resolve(null),
  postPrComment: () => Promise.resolve(null),
  readPrRuns: (r: unknown) => readPrRuns(r),
  readRunJobs: (r: unknown) => readRunJobs(r),
  readJobLog: (r: unknown) => readJobLog(r),
  rerunFailedJobs: (r: unknown) => rerunFailedJobs(r),
}));

const state = () => useHiveStore.getState();
const ok = <T,>(value: T) => ({ ok: true as const, value });
const refused = (message: string) => ({ ok: false as const, error: { kind: 'unknown' as const, message } });
const run = (id: number, headSha: string, over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id, number: id, attempt: 1, status: 'completed', conclusion: 'success', headSha, event: 'push',
  workflowName: 'CI', createdAt: '2026-10-03T14:00:00Z', updatedAt: '2026-10-03T14:01:00Z', url: 'u', ...over,
});
const job = (id: number, runId: number): RunJob => ({ id, runId, name: 'unit', status: 'completed', conclusion: 'failure',
  startedAt: null, completedAt: null, url: 'u', steps: [] });
const KEY = 'acme/nova-web#482';

beforeEach(() => {
  vi.clearAllMocks();
  state().reset();
});

describe('loadPrChecks', () => {
  it('reads the runs, then the jobs of every run in the newest push', async () => {
    readPrRuns.mockResolvedValue(ok({ runs: [run(3, 'new'), run(4, 'new', { workflowName: 'Preview' }), run(2, 'old')], workflows: [] }));
    readRunJobs.mockImplementation(({ id }: { id: number }) => Promise.resolve(ok([job(id * 10, id)])));
    await state().loadPrChecks('acme', 'nova-web', 482, 'feat/x');
    expect(readPrRuns).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', branch: 'feat/x' });
    expect(readRunJobs.mock.calls.map(([r]) => (r as { id: number }).id).sort()).toEqual([3, 4]);
    expect(state().prChecks[KEY]).toMatchObject({ state: 'ok', runs: [{ id: 3 }, { id: 4 }, { id: 2 }], jobs: { 3: [{ id: 30 }], 4: [{ id: 40 }] } });
  });

  it('reads the jobs of the push it is shown', async () => {
    readPrRuns.mockResolvedValue(ok({ runs: [run(3, 'new'), run(2, 'old')], workflows: [] }));
    readRunJobs.mockResolvedValue(ok([]));
    await state().loadPrChecks('acme', 'nova-web', 482, 'feat/x', 'old');
    expect(readRunJobs).toHaveBeenCalledTimes(1);
    expect(readRunJobs).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', id: 2 });
  });

  it('keeps what it read beside the problem when a refresh fails', async () => {
    readPrRuns.mockResolvedValueOnce(ok({ runs: [run(3, 'new')], workflows: [] })).mockResolvedValueOnce(refused('offline')).mockResolvedValueOnce(null);
    readRunJobs.mockResolvedValue(ok([]));
    await state().loadPrChecks('acme', 'nova-web', 482, 'b');
    await state().loadPrChecks('acme', 'nova-web', 482, 'b');
    expect(state().prChecks[KEY]).toMatchObject({ state: 'failed', problem: 'offline', runs: [{ id: 3 }] });
    await state().loadPrChecks('acme', 'nova-web', 482, 'b');
    expect(state().prChecks[KEY]?.problem).toBe(BRIDGE_ERROR);
  });

  it('names a failed jobs read without dropping the runs', async () => {
    readPrRuns.mockResolvedValue(ok({ runs: [run(3, 'new')], workflows: [] }));
    readRunJobs.mockResolvedValue(refused('rate limited'));
    await state().loadPrChecks('acme', 'nova-web', 482, 'b');
    expect(state().prChecks[KEY]).toMatchObject({ state: 'ok', problem: 'rate limited', runs: [{ id: 3 }] });
  });

  it('holds at most PR_DETAIL_CAP PRs, the newest last', async () => {
    readPrRuns.mockResolvedValue(ok({ runs: [], workflows: [] }));
    for (let n = 1; n <= PR_DETAIL_CAP + 1; n += 1) await state().loadPrChecks('acme', 'nova-web', n, 'b');
    expect(Object.keys(state().prChecks)).toHaveLength(PR_DETAIL_CAP);
    expect(state().prChecks['acme/nova-web#1']).toBeUndefined();
  });

  it('drops a PR that left the sweep', async () => {
    state().hydratePrs([prRecord({ number: 482 })], 1);
    readPrRuns.mockResolvedValue(ok({ runs: [], workflows: [] }));
    await state().loadPrChecks('acme', 'nova-web', 482, 'b');
    state().hydratePrs([], 1);
    expect(state().prChecks[KEY]).toBeUndefined();
  });
});

describe('loadJobLog', () => {
  beforeEach(async () => {
    readPrRuns.mockResolvedValue(ok({ runs: [], workflows: [] }));
    await state().loadPrChecks('acme', 'nova-web', 482, 'b');
  });

  it('reads a job’s log once', async () => {
    readJobLog.mockResolvedValue(ok({ lines: ['Error: boom'], truncated: false }));
    await state().loadJobLog('acme', 'nova-web', 482, 77);
    await state().loadJobLog('acme', 'nova-web', 482, 77);
    expect(readJobLog).toHaveBeenCalledTimes(1);
    expect(state().prChecks[KEY]?.logs[77]).toEqual({ state: 'ok', log: { lines: ['Error: boom'], truncated: false } });
  });

  it('reads again only after a failure', async () => {
    readJobLog.mockResolvedValueOnce(refused('timeout')).mockResolvedValueOnce(ok({ lines: [], truncated: false }));
    await state().loadJobLog('acme', 'nova-web', 482, 77);
    expect(state().prChecks[KEY]?.logs[77]).toEqual({ state: 'failed', problem: 'timeout' });
    await state().loadJobLog('acme', 'nova-web', 482, 77);
    expect(readJobLog).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a PR it holds no checks for', async () => {
    await state().loadJobLog('acme', 'nova-web', 1, 77);
    expect(readJobLog).not.toHaveBeenCalled();
  });
});

describe('rerunFailed', () => {
  it('re-runs, then reads the checks again', async () => {
    rerunFailedJobs.mockResolvedValue(ok(true));
    readPrRuns.mockResolvedValue(ok({ runs: [], workflows: [] }));
    await expect(state().rerunFailed('acme', 'nova-web', 482, 2207, 'b')).resolves.toEqual(ok(true));
    expect(rerunFailedJobs).toHaveBeenCalledWith({ owner: 'acme', repo: 'nova-web', id: 2207 });
    expect(readPrRuns).toHaveBeenCalledTimes(1);
  });

  it('answers the refusal and reads nothing', async () => {
    rerunFailedJobs.mockResolvedValueOnce(refused('no')).mockResolvedValueOnce(null);
    await expect(state().rerunFailed('acme', 'nova-web', 482, 1, 'b')).resolves.toEqual(refused('no'));
    await expect(state().rerunFailed('acme', 'nova-web', 482, 1, 'b')).resolves.toMatchObject({ ok: false, error: { message: BRIDGE_ERROR } });
    expect(readPrRuns).not.toHaveBeenCalled();
  });
});
