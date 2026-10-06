// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGithub } from '../../../../../electron/main/integrations/github';
import { PR_TIMELINE_QUERY } from '../../../../../electron/main/integrations/github/query';
import type { RunAsync } from '../../../../../electron/main/integrations/github/run';
import {
  emptySnapshot,
  type ConfigSnapshot,
  type ProjectConfig,
} from '../../../../../electron/shared/config-contract';

/**
 * Composition: find `gh`, name the repositories, sweep, answer.
 *
 * The runner is injected, so no `gh` is executed. The **search** is real,
 * because "found" has to mean an executable file that is actually there — the
 * same thing `gh.test.ts` proves for the status verb.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hive-github-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Put a real, executable `gh` on a real directory and return that directory. */
function withGh(): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'gh');
  writeFileSync(file, '#!/bin/sh\n');
  chmodSync(file, 0o755);
  return dir;
}

const project = (over: Partial<ProjectConfig> = {}): ProjectConfig => ({
  id: 'nova-web',
  name: 'nova-web',
  path: '/repos/nova-web',
  icon: 'ph-cube',
  origin: 'local',
  status: 'ok',
  key: 'nw',
  isRepo: true,
  ...over,
});

const config = (projects: ProjectConfig[]): ConfigSnapshot => ({
  ...emptySnapshot('/tmp/hive/config.json'),
  projects,
});

const SWEEP = JSON.stringify({
  data: {
    viewer: { login: 'octocat' },
    open: {
      nodes: [
        {
          number: 482,
          title: 'Hero: semantic token refactor',
          url: 'https://github.com/acme/nova-web/pull/482',
          isDraft: false,
          state: 'OPEN',
          reviewDecision: 'APPROVED',
          headRefName: 'feat/hero-refresh',
          updatedAt: '2026-08-09T11:00:00Z',
          mergedAt: null,
          author: { login: 'octocat' },
          repository: { name: 'nova-web', owner: { login: 'acme' } },
          reviewThreads: { nodes: [{ isResolved: false }] },
          commits: {
            nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }],
          },
        },
      ],
    },
    merged: { nodes: [] },
  },
});

/** Answers `repo view` with a name and `api graphql` with a sweep. */
const runner = (): RunAsync => (_file, args) => {
  if (args[0] === 'repo') {
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ nameWithOwner: 'acme/nova-web' }),
      stderr: '',
      timedOut: false,
    });
  }

  return Promise.resolve({ code: 0, stdout: SWEEP, stderr: '', timedOut: false });
};

describe('createGithub', () => {
  it('resolveProjects answers an empty map without gh, and project → repo with it (HIVE-166)', async () => {
    const calls: string[][] = [];
    const run: RunAsync = (_file, args, options) => {
      calls.push([...args, options?.cwd ?? '']);
      return Promise.resolve({
        code: 0,
        stdout: JSON.stringify({ nameWithOwner: 'acme/nova-web' }),
        stderr: '',
        timedOut: false,
      });
    };

    const without = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: '/nowhere' }),
      run,
      now: () => 0,
    });
    expect(await without.resolveProjects()).toEqual(new Map());
    expect(calls).toEqual([]);

    const bin = withGh();
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: bin }),
      run,
      now: () => 0,
    });
    expect([...(await github.resolveProjects())]).toEqual([
      ['nova-web', { owner: 'acme', name: 'nova-web' }],
    ]);
    expect(calls[0]).toEqual(['repo', 'view', '--json', 'nameWithOwner', '/repos/nova-web']);
  });

  it('answers with the PRs and how many repositories were swept', async () => {
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: withGh() }),
      run: runner(),
      now: () => Date.parse('2026-08-09T12:00:00Z'),
    });

    const result = await github.prs();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.repos).toBe(1);
    expect(result.value.prs).toHaveLength(1);
    // The three badge inputs, end to end: approved, one finding, CI running.
    expect(result.value.prs[0]).toMatchObject({
      state: 'approved',
      findings: 1,
      checks: 'running',
    });
  });

  /**
   * Configuration, not failure. The panel explains this rather than apologising
   * for it — see `PrSource` for which kinds land on which side.
   */
  it('reports a machine with no gh as not-installed', async () => {
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: dir }),
      run: runner(),
      now: () => Date.now(),
    });

    const result = await github.prs();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not-installed');
  });

  it('reports no-repos when nothing configured is a GitHub repository', async () => {
    const github = createGithub({
      config: () => config([project({ isRepo: false })]),
      env: () => ({ PATH: withGh() }),
      run: runner(),
      now: () => Date.now(),
    });

    const result = await github.prs();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('no-repos');
  });

  /**
   * The misdiagnosis this ordering used to produce.
   *
   * Resolution runs before the sweep, and `gh repo view` fails for every
   * project when no host is logged in — so the list came back empty and the
   * sweep short-circuited on the count with `no-repos`. The user was told to
   * fix their project list when the fix was `gh auth login`, and the
   * `unauthenticated` message was unreachable on the only path that could
   * produce it.
   */
  it('reports a logged-out gh as unauthenticated, not as no-repos', async () => {
    const loggedOut: RunAsync = () =>
      Promise.resolve({
        code: 1,
        stdout: '',
        stderr: 'To get started with GitHub CLI, please run: gh auth login',
        timedOut: false,
      });

    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: withGh() }),
      run: loggedOut,
      now: () => Date.now(),
    });

    const result = await github.prs();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unauthenticated');
    expect(result.error.message).toContain('gh auth login');
  });

  /**
   * A partial failure does not outrank a partial success: four repositories
   * that resolved still get swept when a fifth was unreachable.
   */
  it('sweeps what resolved even when another project failed', async () => {
    const mixed: RunAsync = (_file, args, options) => {
      if (args[0] === 'repo') {
        return options?.cwd === '/repos/nova-web'
          ? Promise.resolve({
              code: 0,
              stdout: JSON.stringify({ nameWithOwner: 'acme/nova-web' }),
              stderr: '',
              timedOut: false,
            })
          : Promise.resolve({
              code: 1,
              stdout: '',
              stderr: 'gh auth login',
              timedOut: false,
            });
      }
      return Promise.resolve({ code: 0, stdout: SWEEP, stderr: '', timedOut: false });
    };

    const github = createGithub({
      config: () => config([project(), project({ id: 'other', path: '/repos/other' })]),
      env: () => ({ PATH: withGh() }),
      run: mixed,
      now: () => Date.parse('2026-08-09T12:00:00Z'),
    });

    const result = await github.prs();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.repos).toBe(1);
  });

  /**
   * The config is read per call, not captured. Projects are added and removed
   * while the app runs, and a poller holding a snapshot from launch would keep
   * sweeping a repository the user had removed.
   */
  it('picks up a project added after the first sweep', async () => {
    let projects: ProjectConfig[] = [];
    const github = createGithub({
      config: () => config(projects),
      env: () => ({ PATH: withGh() }),
      run: runner(),
      now: () => Date.parse('2026-08-09T12:00:00Z'),
    });

    await expect(github.prs()).resolves.toMatchObject({ ok: false });

    projects = [project()];

    const result = await github.prs();
    expect(result.ok).toBe(true);
  });

  /**
   * `gh` is re-resolved every read against the `PATH` a session would use,
   * which the settings pane can change while the app is running. Resolving once
   * at startup would keep reporting "not installed" after the user fixed
   * exactly the thing the message told them to fix.
   */
  it('finds a gh that appeared after a failed read', async () => {
    let path = '/nowhere';
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: path }),
      run: runner(),
      now: () => Date.parse('2026-08-09T12:00:00Z'),
    });

    await expect(github.prs()).resolves.toMatchObject({ ok: false });

    path = withGh();

    await expect(github.prs()).resolves.toMatchObject({ ok: true });
  });

  it('keeps the last good sweep for a lookup, until it is older than asked', async () => {
    let now = Date.parse('2026-08-09T12:00:00Z');
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: withGh() }),
      run: runner(),
      now: () => now,
    });

    expect(github.latestPrs(90_000)).toBeNull();
    await github.prs();

    now += 90_000;
    expect(github.latestPrs(90_000)?.prs[0]?.number).toBe(482);
    now += 1;
    expect(github.latestPrs(90_000)).toBeNull();
  });

  it('keeps nothing from a failed sweep', async () => {
    const github = createGithub({
      config: () => config([project({ isRepo: false })]),
      env: () => ({ PATH: withGh() }),
      run: runner(),
      now: () => 0,
    });

    await github.prs();

    expect(github.latestPrs(90_000)).toBeNull();
  });

  it('shares one sweep between callers that arrive while it runs', async () => {
    const run = vi.fn<RunAsync>(runner());
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: withGh() }),
      run,
      now: () => Date.parse('2026-08-09T12:00:00Z'),
    });
    const sweeps = () => run.mock.calls.filter(([, args]) => args[0] === 'api').length;

    const [first, second] = await Promise.all([github.prs(), github.prs()]);
    expect(second).toBe(first);
    expect(sweeps()).toBe(1);

    // Done is done: the next caller starts its own.
    await github.prs();
    expect(sweeps()).toBe(2);
  });

  /** The directory→repository memo survives between sweeps. */
  it('does not re-ask which repository a project is on every sweep', async () => {
    const run = vi.fn<RunAsync>(runner());
    const github = createGithub({
      config: () => config([project()]),
      env: () => ({ PATH: withGh() }),
      run,
      now: () => Date.parse('2026-08-09T12:00:00Z'),
    });

    await github.prs();
    await github.prs();

    const repoViews = run.mock.calls.filter(([, args]) => args[0] === 'repo');
    expect(repoViews).toHaveLength(1);
  });
});

describe('prDetail and prComment (HIVE-205)', () => {
  const DETAIL = JSON.stringify({ data: { repository: { pullRequest: {
    id: 'PR_1', number: 482, title: 'Hero', url: 'https://github.com/acme/nova-web/pull/482',
    state: 'OPEN', isDraft: false, body: '', createdAt: '2026-08-09T10:00:00Z',
  } } } });
  const recording = (calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    const stdout = args[0] === 'repo'
      ? JSON.stringify({ nameWithOwner: 'acme/nova-web' })
      : args[3]?.includes('addComment') === true
        ? JSON.stringify({ data: { addComment: { subject: { id: 'PR_1' } } } })
        : DETAIL;
    return Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false });
  };
  const github = (calls: string[][]) => createGithub({
    config: () => config([project()]),
    env: () => ({ PATH: withGh() }),
    run: recording(calls),
    now: () => 0,
  });
  const graphqlCalls = (calls: string[][]) => calls.filter((args) => args[0] === 'api');

  it('reads a mapped repository with the resolver’s spelling, whatever case was asked', async () => {
    const calls: string[][] = [];
    await expect(github(calls).prDetail({ owner: 'ACME', repo: 'Nova-Web', n: 482 }))
      .resolves.toMatchObject({ ok: true, value: { owner: 'acme', repo: 'nova-web', number: 482 } });
    expect(graphqlCalls(calls)[0]).toEqual(expect.arrayContaining(['owner=acme', 'name=nova-web', 'number=482']));
  });

  it('refuses a repository no configured project maps, before any GraphQL call', async () => {
    const calls: string[][] = [];
    const gh = github(calls);

    await expect(gh.prDetail({ owner: 'someone', repo: 'else', n: 1 })).resolves.toEqual({
      ok: false,
      error: { kind: 'no-repos', message: "someone/else is not a configured project's repository." },
    });
    await expect(gh.prComment({ owner: 'someone', repo: 'else', n: 1, body: 'hi' })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'no-repos' },
    });
    expect(graphqlCalls(calls)).toEqual([]);
  });

  it('comments on a mapped repository', async () => {
    const calls: string[][] = [];
    await expect(github(calls).prComment({ owner: 'acme', repo: 'nova-web', n: 482, body: 'LGTM' }))
      .resolves.toEqual({ ok: true, value: true });
    expect(graphqlCalls(calls)).toHaveLength(2);
  });

  it('answers not-installed without gh', async () => {
    const gh = createGithub({ config: () => config([project()]), env: () => ({ PATH: '/nowhere' }), run: recording([]), now: () => 0 });
    await expect(gh.prDetail({ owner: 'acme', repo: 'nova-web', n: 482 })).resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
  });
});

describe('prTimeline (HIVE-208)', () => {
  const TIMELINE = JSON.stringify({ data: { repository: { pullRequest: {
    createdAt: '2026-10-03T11:00:00Z', mergedAt: null, isDraft: false, timelineItems: { nodes: [] },
  } } } });
  const recording = (calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    const stdout = args[0] === 'repo' ? JSON.stringify({ nameWithOwner: 'acme/nova-web' }) : TIMELINE;
    return Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false });
  };
  const github = (calls: string[][]) => createGithub({
    config: () => config([project()]),
    env: () => ({ PATH: withGh() }),
    run: recording(calls),
    now: () => 0,
  });
  const graphqlCalls = (calls: string[][]) => calls.filter((args) => args[0] === 'api');

  it('reads a mapped repository’s timeline with the resolver’s spelling, whatever case was asked', async () => {
    const calls: string[][] = [];
    await expect(github(calls).prTimeline({ owner: 'ACME', repo: 'Nova-Web', n: 482 }))
      .resolves.toMatchObject({ ok: true, value: { createdAt: '2026-10-03T11:00:00Z', commits: [] } });
    expect(graphqlCalls(calls)).toEqual([
      ['api', 'graphql', '-f', `query=${PR_TIMELINE_QUERY}`, '-f', 'owner=acme', '-f', 'name=nova-web', '-F', 'number=482'],
    ]);
  });

  it('refuses a repository no configured project maps, before any GraphQL call', async () => {
    const calls: string[][] = [];
    await expect(github(calls).prTimeline({ owner: 'someone', repo: 'else', n: 1 })).resolves.toEqual({
      ok: false,
      error: { kind: 'no-repos', message: "someone/else is not a configured project's repository." },
    });
    expect(graphqlCalls(calls)).toEqual([]);
  });
});

describe('prDiff, prThread and prViewed (HIVE-207)', () => {
  const recording = (calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    const query = args[3] ?? '';
    const stdout = args[0] === 'repo'
      ? JSON.stringify({ nameWithOwner: 'acme/nova-web' })
      : args[0] === 'pr'
        ? 'diff --git a/x b/x\n'
        : query.includes('node(id:')
          ? JSON.stringify({ data: { node: { pullRequest: { number: 482, repository: { owner: { login: 'acme' }, name: 'nova-web' } } } } })
          : query.includes('resolveReviewThread')
            ? JSON.stringify({ data: { resolveReviewThread: { thread: { id: 'T', isResolved: true } } } })
            : query.includes('markFileAsViewed')
              ? JSON.stringify({ data: { markFileAsViewed: { pullRequest: { id: 'PR_1' } } } })
              : JSON.stringify({ data: { repository: { pullRequest: { id: 'PR_1' } } } });
    return Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false });
  };
  const github = (calls: string[][]) => createGithub({ config: () => config([project()]), env: () => ({ PATH: withGh() }), run: recording(calls), now: () => 0 });

  it('reads the diff with the resolver’s spelling, whatever case was asked', async () => {
    const calls: string[][] = [];
    await expect(github(calls).prDiff({ owner: 'ACME', repo: 'Nova-Web', n: 482 })).resolves.toEqual({ ok: true, value: 'diff --git a/x b/x\n' });
    expect(calls.find((args) => args[0] === 'pr')).toEqual(['pr', 'diff', '482', '--repo', 'acme/nova-web', '--color', 'never']);
  });

  it('resolves a thread and marks a file viewed on a mapped repository', async () => {
    const gh = github([]);
    await expect(gh.prThread({ owner: 'acme', repo: 'nova-web', n: 482, threadId: 'T', op: 'resolve' })).resolves.toEqual({ ok: true, value: true });
    await expect(gh.prViewed({ owner: 'acme', repo: 'nova-web', n: 482, path: 'x', viewed: true })).resolves.toEqual({ ok: true, value: true });
  });

  it('refuses a repository no configured project maps, before any gh pr or GraphQL call', async () => {
    const calls: string[][] = [];
    const gh = github(calls);
    const ref = { owner: 'someone', repo: 'else', n: 1 };
    await expect(gh.prDiff(ref)).resolves.toMatchObject({ ok: false, error: { kind: 'no-repos' } });
    await expect(gh.prThread({ ...ref, threadId: 'T', op: 'reply', body: 'hi' })).resolves.toMatchObject({ ok: false, error: { kind: 'no-repos' } });
    await expect(gh.prViewed({ ...ref, path: 'x', viewed: false })).resolves.toMatchObject({ ok: false, error: { kind: 'no-repos' } });
    expect(calls.filter((args) => args[0] === 'api' || args[0] === 'pr')).toEqual([]);
  });
});

describe('the Checks verbs (HIVE-206)', () => {
  const RUNS = JSON.stringify([{ databaseId: 9, number: 9, attempt: 1, status: 'completed', conclusion: 'success',
    headSha: 'abc', event: 'push', workflowName: 'CI', createdAt: 'c', updatedAt: 'u', url: 'x' }]);
  const recording = (calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    const stdout = args[0] === 'repo' ? JSON.stringify({ nameWithOwner: 'acme/nova-web' }) : args[1] === 'list' ? RUNS : JSON.stringify({ jobs: [] });
    return Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false });
  };
  const github = (calls: string[][], path = '/repos/nova-web') => createGithub({
    config: () => config([project({ path })]), env: () => ({ PATH: withGh() }), run: recording(calls), now: () => 0,
  });
  /** Every Actions call: `gh run …`, and the job log's `gh api …/actions/jobs/<id>/logs`. */
  const ghRunCalls = (calls: string[][]) =>
    calls.filter((args) => args[0] === 'run' || (args[0] === 'api' && args.some((arg) => arg.includes('/actions/'))));

  it('reads runs with the resolver’s spelling and the checkout’s workflows', async () => {
    const checkout = join(dir, 'checkout');
    mkdirSync(join(checkout, '.github/workflows'), { recursive: true });
    writeFileSync(join(checkout, '.github/workflows/ci.yml'), 'name: CI\njobs:\n  lint:\n    needs: install\n');
    const calls: string[][] = [];
    const result = await github(calls, checkout).prRuns({ owner: 'ACME', repo: 'Nova-Web', branch: 'feat/x' });
    expect(ghRunCalls(calls)[0]).toContain('acme/nova-web');
    expect(result).toMatchObject({ ok: true, value: { runs: [{ id: 9 }], workflows: [{ file: 'ci.yml', jobs: [{ id: 'lint', needs: ['install'] }] }] } });
  });

  it('answers runs with no workflows when the checkout has none', async () => {
    const result = await github([], join(dir, 'missing')).prRuns({ owner: 'acme', repo: 'nova-web', branch: 'main' });
    expect(result).toMatchObject({ ok: true, value: { workflows: [] } });
  });

  it.each([
    ['prRuns', (g: ReturnType<typeof github>) => g.prRuns({ owner: 'someone', repo: 'else', branch: 'main' })],
    ['runJobs', (g: ReturnType<typeof github>) => g.runJobs({ owner: 'someone', repo: 'else', id: 1 })],
    ['jobLog', (g: ReturnType<typeof github>) => g.jobLog({ owner: 'someone', repo: 'else', id: 1 })],
    ['rerunFailed', (g: ReturnType<typeof github>) => g.rerunFailed({ owner: 'someone', repo: 'else', id: 1 })],
  ])('%s refuses an unmapped repository before any gh run', async (_name, verb) => {
    const calls: string[][] = [];
    await expect(verb(github(calls))).resolves.toMatchObject({ ok: false, error: { kind: 'no-repos' } });
    expect(ghRunCalls(calls)).toEqual([]);
  });

  it('routes jobs, log and rerun to gh with the mapped repository', async () => {
    const calls: string[][] = [];
    const gh = github(calls);
    await gh.runJobs({ owner: 'acme', repo: 'nova-web', id: 5 });
    await gh.jobLog({ owner: 'acme', repo: 'nova-web', id: 6 });
    await gh.rerunFailed({ owner: 'acme', repo: 'nova-web', id: 7 });
    expect(ghRunCalls(calls).map((args) => args.slice(0, 3))).toEqual([
      ['run', 'view', '5'],
      ['api', '--allow-escape-sequences', 'repos/acme/nova-web/actions/jobs/6/logs'],
      ['run', 'rerun', '7'],
    ]);
  });
});
