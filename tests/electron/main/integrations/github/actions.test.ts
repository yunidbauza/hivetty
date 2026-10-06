// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createActionsClient } from '../../../../../electron/main/integrations/github/actions';
import type { RunAsync, RunResult } from '../../../../../electron/main/integrations/github/run';

const REF = { owner: 'acme', name: 'nova-web' };
const answering = (result: Partial<RunResult>, calls: string[][] = []): RunAsync => (_file, args) => {
  calls.push([...args]);
  return Promise.resolve({ code: 0, stdout: '', stderr: '', timedOut: false, ...result });
};

const RUN = { databaseId: 2207, number: 2207, attempt: 1, status: 'completed', conclusion: 'failure',
  headSha: '9f3c2ab0', event: 'push', workflowName: 'CI', createdAt: '2026-10-03T14:00:00Z',
  updatedAt: '2026-10-03T14:04:00Z', url: 'https://github.com/acme/nova-web/actions/runs/2207' };
const JOBS = { jobs: [{ databaseId: 77, name: 'integration', status: 'completed', conclusion: 'failure',
  startedAt: '2026-10-03T14:00:10Z', completedAt: '2026-10-03T14:03:20Z', url: 'https://x/job/77',
  steps: [
    { number: 1, name: 'Set up job', status: 'completed', conclusion: 'success', startedAt: '2026-10-03T14:00:10Z', completedAt: '2026-10-03T14:00:12Z' },
    { number: 2, name: 'Upload', status: 'completed', conclusion: 'skipped', startedAt: '0001-01-01T00:00:00Z', completedAt: '0001-01-01T00:00:00Z' },
  ] }] };

describe('createActionsClient (HIVE-206)', () => {
  it('lists the branch’s runs with the branch as one argv token', async () => {
    const calls: string[][] = [];
    const client = createActionsClient('/bin/gh', answering({ stdout: JSON.stringify([RUN]) }, calls));
    const result = await client.runs(REF, '-x; rm');
    expect(calls[0]).toEqual(['run', 'list', '--repo', 'acme/nova-web', '--branch=-x; rm', '--limit', '40', '--json',
      'databaseId,number,attempt,status,conclusion,headSha,event,workflowName,createdAt,updatedAt,url']);
    expect(result).toEqual({ ok: true, value: [{ id: 2207, number: 2207, attempt: 1, status: 'completed', conclusion: 'failure',
      headSha: '9f3c2ab0', event: 'push', workflowName: 'CI', createdAt: RUN.createdAt, updatedAt: RUN.updatedAt, url: RUN.url }] });
  });

  it('reads a run’s jobs and steps, an unset time as null', async () => {
    const calls: string[][] = [];
    const client = createActionsClient('/bin/gh', answering({ stdout: JSON.stringify(JOBS) }, calls));
    const result = await client.jobs(REF, 2207);
    expect(calls[0]).toEqual(['run', 'view', '2207', '--repo', 'acme/nova-web', '--json', 'jobs']);
    expect(result.ok && result.value[0]).toMatchObject({ id: 77, runId: 2207, name: 'integration', conclusion: 'failure' });
    expect(result.ok && result.value[0]?.steps[1]).toMatchObject({ conclusion: 'skipped', startedAt: null, completedAt: null });
  });

  it('reads one job’s log from the REST endpoint, which serves it before the run ends, and cuts it', async () => {
    const calls: string[][] = [];
    const client = createActionsClient('/bin/gh', answering({ stdout: '\uFEFF2026-10-03T14:00:00.1Z Error: boom\n' }, calls));
    await expect(client.log(REF, 77)).resolves.toEqual({ ok: true, value: { lines: ['Error: boom'], truncated: false } });
    // Not `gh run view --log-failed`: it refuses every log until the whole run completes.
    expect(calls[0]).toEqual(['api', '--allow-escape-sequences', 'repos/acme/nova-web/actions/jobs/77/logs']);
  });

  it('re-runs the failed jobs of a run', async () => {
    const calls: string[][] = [];
    const client = createActionsClient('/bin/gh', answering({}, calls));
    await expect(client.rerunFailed(REF, 2207)).resolves.toEqual({ ok: true, value: true });
    expect(calls[0]).toEqual(['run', 'rerun', '2207', '--repo', 'acme/nova-web', '--failed']);
  });

  it('names a failure by its kind and never by gh’s words', async () => {
    const client = createActionsClient('/bin/gh', answering({ code: 1, stderr: 'HTTP 401: Bad credentials (token ghp_secret)' }));
    const result = await client.runs(REF, 'main');
    expect(result).toMatchObject({ ok: false, error: { kind: 'unauthenticated' } });
    expect(JSON.stringify(result)).not.toContain('ghp_secret');
  });

  it('answers unknown for output it cannot read', async () => {
    const client = createActionsClient('/bin/gh', answering({ stdout: '<html>' }));
    await expect(client.jobs(REF, 1)).resolves.toMatchObject({ ok: false, error: { kind: 'unknown' } });
  });

  it('answers, never throws, when gh cannot start', async () => {
    const client = createActionsClient('/bin/gh', () => Promise.reject(new Error('ENOENT')));
    await expect(client.rerunFailed(REF, 1)).resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
  });
});
