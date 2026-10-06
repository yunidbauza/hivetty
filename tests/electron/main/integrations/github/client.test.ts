// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createGithubClient } from '../../../../../electron/main/integrations/github/client';
import {
  FILE_UNVIEWED_MUTATION,
  FILE_VIEWED_MUTATION,
  PR_COMMENT_MUTATION,
  PR_DETAIL_QUERY,
  PR_ID_QUERY,
  PR_THREAD_OWNER_QUERY,
  PR_TIMELINE_QUERY,
  type RepoRef,
  THREAD_REPLY_MUTATION,
  THREAD_RESOLVE_MUTATION,
  THREAD_UNRESOLVE_MUTATION,
} from '../../../../../electron/main/integrations/github/query';
import type { RunAsync } from '../../../../../electron/main/integrations/github/run';

/**
 * The sweep, and how a failure is told apart from an answer.
 *
 * The interesting rule here is that **the payload beats the exit code**: `gh`
 * exits non-zero whenever GraphQL reports any error, including the very common
 * case where it also returns perfectly good data for the repositories that were
 * readable.
 */

const REPOS: RepoRef[] = [{ owner: 'acme', name: 'nova-web' }];
const NOW = Date.parse('2026-08-09T12:00:00Z');

const prNode = (over: Record<string, unknown> = {}) => ({
  number: 482,
  title: 'Hero: semantic token refactor',
  url: 'https://github.com/acme/nova-web/pull/482',
  isDraft: false,
  state: 'OPEN',
  reviewDecision: null,
  headRefName: 'feat/hero-refresh',
  updatedAt: '2026-08-09T11:00:00Z',
  mergedAt: null,
  author: { login: 'octocat' },
  repository: { name: 'nova-web', owner: { login: 'acme' } },
  reviewThreads: { nodes: [{ isResolved: false }] },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  ...over,
});

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    data: {
      viewer: { login: 'octocat' },
      open: { nodes: [prNode()] },
      merged: { nodes: [] },
      ...over,
    },
  });

const answering = (
  result: Partial<{ code: number; stdout: string; stderr: string; timedOut: boolean }>,
): RunAsync =>
  () =>
    Promise.resolve({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      ...result,
    });

describe('createGithubClient', () => {
  it('reads the PRs out of a successful sweep', async () => {
    const client = createGithubClient('/usr/bin/gh', answering({ stdout: body() }));

    const result = await client.sweep(REPOS, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      number: 482,
      repo: 'nova-web',
      owner: 'acme',
      findings: 1,
      checks: 'passing',
    });
  });

  it('passes the repositories as variables, never in the query', async () => {
    const run = vi.fn<RunAsync>().mockResolvedValue({
      code: 0,
      stdout: body(),
      stderr: '',
      timedOut: false,
    });

    await createGithubClient('/usr/bin/gh', run).sweep(REPOS, NOW);

    const [file, args] = run.mock.calls[0];
    expect(file).toBe('/usr/bin/gh');
    expect(args.slice(0, 3)).toEqual(['api', 'graphql', '-f']);
    expect(args).toContain(
      'open=is:pr author:@me is:open repo:acme/nova-web sort:updated-desc',
    );
    expect(args).toContain(
      'merged=is:pr author:@me is:merged repo:acme/nova-web sort:updated-desc',
    );

    const query = args.find((arg) => arg.startsWith('query='));
    expect(query).toBeDefined();
    expect(query).not.toContain('nova-web');
  });

  /** Nothing to sweep is a configuration answer, and never a request. */
  it('refuses to call gh with no repositories', async () => {
    const run = vi.fn<RunAsync>();

    const result = await createGithubClient('/usr/bin/gh', run).sweep([], NOW);

    expect(run).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'no-repos',
        message: 'No configured project is a GitHub repository.',
      },
    });
  });

  /**
   * The dangerous half of the same rule, and the reason the guard counts
   * qualifiers rather than repositories.
   *
   * A repository whose name cannot safely become a `repo:` qualifier is dropped,
   * so a config full of them leaves a non-empty repository list and an *empty
   * scope*. `is:pr author:@me sort:updated-desc` with no `repo:` is not an
   * error — it is a valid search that answers with the user's pull requests from
   * every repository they have ever touched. Sending it would quietly fill the
   * panel with work from projects the user never configured.
   */
  it('refuses to call gh when no repository can be scoped safely', async () => {
    const run = vi.fn<RunAsync>();

    const result = await createGithubClient('/usr/bin/gh', run).sweep(
      [{ owner: 'acme', name: 'web is:public' }],
      NOW,
    );

    expect(run).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('no-repos');
    // Not "none of your projects is a GitHub repository" — they resolved fine.
    expect(result.error.message).toContain('GitHub search');
  });

  /**
   * The case this shape exists for: one repository of several is inaccessible,
   * so GraphQL answers with an error *and* the data for the rest, and `gh`
   * exits 1. Reading the exit code first would throw the rest away.
   */
  it('keeps partial data when gh exits non-zero', async () => {
    const stdout = JSON.stringify({
      data: JSON.parse(body()).data,
      errors: [{ message: 'Could not resolve to a Repository named other/gone.' }],
    });

    const result = await createGithubClient(
      '/usr/bin/gh',
      answering({ code: 1, stdout }),
    ).sweep(REPOS, NOW);

    expect(result.ok).toBe(true);
  });

  it.each([
    ['timeout', { timedOut: true, code: -1 }, 'timeout'],
    ['a rate limit', { code: 1, stderr: 'API rate limit exceeded' }, 'rate-limited'],
    ['no network', { code: 1, stderr: 'dial tcp: lookup api.github.com' }, 'offline'],
    ['bad credentials', { code: 1, stderr: 'HTTP 401: Bad credentials' }, 'unauthenticated'],
    ['something else', { code: 1, stderr: 'weird' }, 'unknown'],
  ] as const)('classifies %s', async (_label, over, kind) => {
    const result = await createGithubClient(
      '/usr/bin/gh',
      answering(over),
    ).sweep(REPOS, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe(kind);
  });

  /**
   * `viewer` is the sentinel for "this request genuinely succeeded". Both
   * searches answering empty is a legitimate outcome for a user with no open
   * work, and indistinguishable from a failure without it.
   */
  it('fails rather than guessing when the viewer is unreadable', async () => {
    const stdout = JSON.stringify({ data: { open: null, merged: null } });

    const result = await createGithubClient(
      '/usr/bin/gh',
      answering({ stdout }),
    ).sweep(REPOS, NOW);

    expect(result.ok).toBe(false);
  });

  /**
   * The failure `viewer` alone cannot see.
   *
   * `viewer` is a top-level field that resolves independently of the two
   * searches, so a response where both connections failed still carries a good
   * login. Reading that as a successful empty sweep would install a *live, not
   * stale* empty list and put "No open pull requests of yours" on the panel with
   * total confidence — the exact failure this integration was rewritten to stop.
   */
  it('fails when both searches came back null, however good the viewer is', async () => {
    const stdout = JSON.stringify({
      data: { viewer: { login: 'octocat' }, open: null, merged: null },
      errors: [{ message: 'Something went wrong while executing your query.' }],
    });

    const result = await createGithubClient(
      '/usr/bin/gh',
      answering({ code: 1, stdout, stderr: 'timeout' }),
    ).sweep(REPOS, NOW);

    expect(result.ok).toBe(false);
  });

  /** An empty connection is not a missing one — a quiet user is not a failure. */
  it('reads two empty searches as a successful empty sweep', async () => {
    const stdout = JSON.stringify({
      data: {
        viewer: { login: 'octocat' },
        open: { nodes: [] },
        merged: { nodes: [] },
      },
    });

    const result = await createGithubClient(
      '/usr/bin/gh',
      answering({ stdout }),
    ).sweep(REPOS, NOW);

    expect(result).toEqual({ ok: true, value: [] });
  });

  /** One search surviving is the partial-data case, and it is kept. */
  it('keeps the search that answered when the other came back null', async () => {
    const result = await createGithubClient(
      '/usr/bin/gh',
      answering({ code: 1, stdout: body({ merged: null }) }),
    ).sweep(REPOS, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('reports a gh that could not be executed', async () => {
    const run: RunAsync = () => Promise.reject(new Error('ENOENT'));

    const result = await createGithubClient('/usr/bin/gh', run).sweep(REPOS, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not-installed');
  });

  /** No `stdout` or `stderr` ever escapes — a URL there could carry a token. */
  it('never returns raw command output', async () => {
    const result = await createGithubClient(
      '/usr/bin/gh',
      answering({ code: 1, stderr: 'https://x:ghp_secret@api.github.com failed' }),
    ).sweep(REPOS, NOW);

    expect(JSON.stringify(result)).not.toContain('ghp_secret');
  });
});

describe('detail and comment (HIVE-205)', () => {
  const REF: RepoRef = { owner: 'acme', name: 'nova-web' };
  const DETAIL = JSON.stringify({ data: { repository: { pullRequest: {
    id: 'PR_1', number: 482, title: 'Hero', url: 'https://github.com/acme/nova-web/pull/482',
    state: 'OPEN', isDraft: false, body: '', createdAt: '2026-08-09T10:00:00Z',
  } } } });
  const recording = (answer: (args: readonly string[]) => string, calls: string[][]): RunAsync =>
    (_file, args) => {
      calls.push([...args]);
      return Promise.resolve({ code: 0, stdout: answer(args), stderr: '', timedOut: false });
    };

  it('reads one PR with owner and name as -f strings and the number as -F', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', recording(() => DETAIL, calls));

    await expect(client.detail(REF, 482)).resolves.toMatchObject({ ok: true, value: { id: 'PR_1', owner: 'acme', repo: 'nova-web', number: 482 } });
    expect(calls).toEqual([[
      'api', 'graphql', '-f', `query=${PR_DETAIL_QUERY}`,
      '-f', 'owner=acme', '-f', 'name=nova-web', '-F', 'number=482',
    ]]);
  });

  it('classifies a read with no pull request, and a gh that will not run', async () => {
    const missing = createGithubClient('/usr/bin/gh', () =>
      Promise.resolve({ code: 1, stdout: JSON.stringify({ data: { repository: { pullRequest: null } } }), stderr: 'HTTP 401: Bad credentials', timedOut: false }));
    await expect(missing.detail(REF, 482)).resolves.toMatchObject({ ok: false, error: { kind: 'unauthenticated' } });

    const broken = createGithubClient('/usr/bin/gh', () => Promise.reject(new Error('ENOENT')));
    await expect(broken.detail(REF, 482)).resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
  });

  it('reads the PR id, then adds the comment with the body as a -f string', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', recording((args) =>
      args[3]?.includes('addComment') === true
        ? JSON.stringify({ data: { addComment: { subject: { id: 'PR_1' } } } })
        : JSON.stringify({ data: { repository: { pullRequest: { id: 'PR_1' } } } }), calls));

    await expect(client.comment(REF, 482, '@/etc/passwd\nsecond line')).resolves.toEqual({ ok: true, value: true });
    expect(calls).toEqual([
      ['api', 'graphql', '-f', `query=${PR_ID_QUERY}`, '-f', 'owner=acme', '-f', 'name=nova-web', '-F', 'number=482'],
      ['api', 'graphql', '-f', `query=${PR_COMMENT_MUTATION}`, '-f', 'subjectId=PR_1', '-f', 'body=@/etc/passwd\nsecond line'],
    ]);
  });

  it('never sends the mutation without an id read from GitHub', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', recording(() => JSON.stringify({ data: { repository: { pullRequest: null } } }), calls));

    await expect(client.comment(REF, 482, 'hello')).resolves.toMatchObject({ ok: false, error: { kind: 'unknown' } });
    expect(calls).toHaveLength(1);
  });

  it('reports a mutation GitHub refused', async () => {
    const client = createGithubClient('/usr/bin/gh', (_file, args) => Promise.resolve({
      code: 1,
      stdout: args[3]?.includes('addComment') === true ? JSON.stringify({ data: { addComment: null } }) : JSON.stringify({ data: { repository: { pullRequest: { id: 'PR_1' } } } }),
      stderr: 'API rate limit exceeded',
      timedOut: false,
    }));
    await expect(client.comment(REF, 482, 'hello')).resolves.toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
  });
});

describe('timeline (HIVE-208)', () => {
  const REF: RepoRef = { owner: 'acme', name: 'server' };
  const TIMELINE = JSON.stringify({ data: { repository: { pullRequest: {
    createdAt: '2026-10-03T11:00:00Z', mergedAt: null, isDraft: false, timelineItems: { nodes: [] } } } } });
  const recording = (answer: () => string, calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    return Promise.resolve({ code: 0, stdout: answer(), stderr: '', timedOut: false });
  };

  it('reads one PR with owner and name as -f and the number as -F', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', recording(() => TIMELINE, calls));
    await expect(client.timeline(REF, 1182)).resolves.toMatchObject({ ok: true, value: { createdAt: '2026-10-03T11:00:00Z', runs: [] } });
    expect(calls).toEqual([['api', 'graphql', '-f', `query=${PR_TIMELINE_QUERY}`, '-f', 'owner=acme', '-f', 'name=server', '-F', 'number=1182']]);
  });

  it('classifies an unreadable answer, and says when gh could not run', async () => {
    const failing = createGithubClient('/usr/bin/gh', answering({ code: 1, stderr: 'Could not resolve to a Repository' }));
    await expect(failing.timeline(REF, 1182)).resolves.toMatchObject({ ok: false });
    const absent = createGithubClient('/usr/bin/gh', () => Promise.reject(new Error('ENOENT')));
    await expect(absent.timeline(REF, 1182)).resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
  });
});

describe('diff (HIVE-207)', () => {
  const REF: RepoRef = { owner: 'acme', name: 'nova-web' };
  const DIFF = 'diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n';

  it('runs gh pr diff with the resolver’s repository, no colour, and answers the text', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', (_file, args) => {
      calls.push([...args]);
      return Promise.resolve({ code: 0, stdout: DIFF, stderr: '', timedOut: false });
    });
    await expect(client.diff(REF, 482)).resolves.toEqual({ ok: true, value: DIFF });
    expect(calls).toEqual([['pr', 'diff', '482', '--repo', 'acme/nova-web', '--color', 'never']]);
  });

  it('classifies a refusal without leaking its output', async () => {
    const client = createGithubClient('/usr/bin/gh', () =>
      Promise.resolve({ code: 1, stdout: 'diff --git secret', stderr: 'HTTP 406: Sorry, the diff exceeded the maximum number of lines (20000) ghp_secret', timedOut: false }));
    const result = await client.diff(REF, 482);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('ghp_secret');
    expect(JSON.stringify(result)).not.toContain('diff --git');
  });

  it('answers not-installed when gh will not run, and a timeout as one', async () => {
    await expect(createGithubClient('/usr/bin/gh', () => Promise.reject(new Error('ENOENT'))).diff(REF, 1))
      .resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
    await expect(createGithubClient('/usr/bin/gh', () => Promise.resolve({ code: -1, stdout: '', stderr: '', timedOut: true })).diff(REF, 1))
      .resolves.toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });
});

describe('thread writes (HIVE-207)', () => {
  const REF: RepoRef = { owner: 'acme', name: 'nova-web' };
  const ON = (number = 482, owner = 'ACME', name = 'Nova-Web') =>
    JSON.stringify({ data: { node: { pullRequest: { number, repository: { owner: { login: owner }, name } } } } });
  const answering = (owner: string, mutation: string, calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    return Promise.resolve({ code: 0, stdout: args[3]?.includes('node(id:') === true ? owner : mutation, stderr: '', timedOut: false });
  };

  it('proves the thread is on the PR, then replies with the body as a -f string', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', answering(ON(), JSON.stringify({ data: { addPullRequestReviewThreadReply: { comment: { id: 'C' } } } }), calls));
    await expect(client.threadReply(REF, 482, 'PRRT_1', '@/etc/passwd')).resolves.toEqual({ ok: true, value: true });
    expect(calls).toEqual([
      ['api', 'graphql', '-f', `query=${PR_THREAD_OWNER_QUERY}`, '-f', 'id=PRRT_1'],
      ['api', 'graphql', '-f', `query=${THREAD_REPLY_MUTATION}`, '-f', 'threadId=PRRT_1', '-f', 'body=@/etc/passwd'],
    ]);
  });

  it.each([
    [true, THREAD_RESOLVE_MUTATION, 'resolveReviewThread'],
    [false, THREAD_UNRESOLVE_MUTATION, 'unresolveReviewThread'],
  ])('resolved=%s sends its own mutation', async (resolved, doc, field) => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', answering(ON(), JSON.stringify({ data: { [field]: { thread: { id: 'PRRT_1', isResolved: resolved } } } }), calls));
    await expect(client.threadResolved(REF, 482, 'PRRT_1', resolved)).resolves.toEqual({ ok: true, value: true });
    expect(calls[1]).toEqual(['api', 'graphql', '-f', `query=${doc}`, '-f', 'threadId=PRRT_1']);
  });

  it.each([
    ['another number', ON(483)],
    ['another owner', ON(482, 'evil')],
    ['another repository', ON(482, 'acme', 'other')],
    ['no such thread', JSON.stringify({ data: { node: null } })],
  ])('refuses a thread on %s and never writes', async (_name, owner) => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', answering(owner, '{}', calls));
    await expect(client.threadReply(REF, 482, 'PRRT_1', 'hi')).resolves.toMatchObject({ ok: false });
    await expect(client.threadResolved(REF, 482, 'PRRT_1', true)).resolves.toMatchObject({ ok: false });
    expect(calls.filter((args) => args[3]?.startsWith('query=mutation') === true)).toEqual([]);
  });

  it('names the mismatch', async () => {
    const client = createGithubClient('/usr/bin/gh', answering(ON(9), '{}', []));
    await expect(client.threadReply(REF, 482, 'PRRT_1', 'hi')).resolves.toEqual({
      ok: false, error: { kind: 'unknown', message: 'That thread is not on this pull request.' },
    });
  });

  it('reports a mutation GitHub refused, classified', async () => {
    const client = createGithubClient('/usr/bin/gh', (_file, args) => Promise.resolve({
      code: 1,
      stdout: args[3]?.includes('node(id:') === true ? ON() : JSON.stringify({ data: { resolveReviewThread: null } }),
      stderr: 'API rate limit exceeded',
      timedOut: false,
    }));
    await expect(client.threadResolved(REF, 482, 'PRRT_1', true)).resolves.toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
  });

  it.each([
    ['a reply with no comment', (c: ReturnType<typeof createGithubClient>) => c.threadReply(REF, 482, 'PRRT_1', 'hi'), { addPullRequestReviewThreadReply: { comment: null } }],
    ['a resolve still unresolved', (c: ReturnType<typeof createGithubClient>) => c.threadResolved(REF, 482, 'PRRT_1', true), { resolveReviewThread: { thread: { id: 'PRRT_1', isResolved: false } } }],
    ['an unresolve still resolved', (c: ReturnType<typeof createGithubClient>) => c.threadResolved(REF, 482, 'PRRT_1', false), { unresolveReviewThread: { thread: { id: 'PRRT_1', isResolved: true } } }],
    ['no data at all', (c: ReturnType<typeof createGithubClient>) => c.threadResolved(REF, 482, 'PRRT_1', true), null],
  ])('refuses a hollow echo: %s', async (_name, act, data) => {
    const client = createGithubClient('/usr/bin/gh', answering(ON(), JSON.stringify({ data }), []));
    await expect(act(client)).resolves.toMatchObject({ ok: false });
  });

  it('answers not-installed when gh will not run', async () => {
    await expect(createGithubClient('/usr/bin/gh', () => Promise.reject(new Error('ENOENT'))).threadReply(REF, 1, 'T', 'x'))
      .resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
  });
});

describe('fileViewed (HIVE-207)', () => {
  const REF: RepoRef = { owner: 'acme', name: 'nova-web' };
  const recording = (mutation: string, calls: string[][]): RunAsync => (_file, args) => {
    calls.push([...args]);
    const stdout = args[3]?.startsWith('query=mutation') === true ? mutation : JSON.stringify({ data: { repository: { pullRequest: { id: 'PR_1' } } } });
    return Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false });
  };

  it.each([
    [true, FILE_VIEWED_MUTATION, 'markFileAsViewed'],
    [false, FILE_UNVIEWED_MUTATION, 'unmarkFileAsViewed'],
  ])('viewed=%s reads the PR id from GitHub, then writes with the path as a -f string', async (viewed, doc, field) => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', recording(JSON.stringify({ data: { [field]: { pullRequest: { id: 'PR_1' } } } }), calls));
    await expect(client.fileViewed(REF, 482, 'src/a b.ts', viewed)).resolves.toEqual({ ok: true, value: true });
    expect(calls).toEqual([
      ['api', 'graphql', '-f', `query=${PR_ID_QUERY}`, '-f', 'owner=acme', '-f', 'name=nova-web', '-F', 'number=482'],
      ['api', 'graphql', '-f', `query=${doc}`, '-f', 'pullRequestId=PR_1', '-f', 'path=src/a b.ts'],
    ]);
  });

  it('never writes without an id read from GitHub', async () => {
    const calls: string[][] = [];
    const client = createGithubClient('/usr/bin/gh', (_file, args) => {
      calls.push([...args]);
      return Promise.resolve({ code: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: null } } }), stderr: '', timedOut: false });
    });
    await expect(client.fileViewed(REF, 482, 'src/a.ts', true)).resolves.toMatchObject({ ok: false, error: { kind: 'unknown' } });
    expect(calls).toHaveLength(1);
  });

  it('reports a refused write', async () => {
    const client = createGithubClient('/usr/bin/gh', recording(JSON.stringify({ data: { markFileAsViewed: null } }), []));
    await expect(client.fileViewed(REF, 482, 'src/a.ts', true)).resolves.toMatchObject({ ok: false });
  });

  it('refuses a write that echoes no pull request', async () => {
    const client = createGithubClient('/usr/bin/gh', recording(JSON.stringify({ data: { unmarkFileAsViewed: { pullRequest: null } } }), []));
    await expect(client.fileViewed(REF, 482, 'src/a.ts', false)).resolves.toMatchObject({ ok: false });
  });

  it('answers not-installed when gh will not run', async () => {
    await expect(createGithubClient('/usr/bin/gh', () => Promise.reject(new Error('ENOENT'))).fileViewed(REF, 1, 'a', true))
      .resolves.toMatchObject({ ok: false, error: { kind: 'not-installed' } });
  });
});
