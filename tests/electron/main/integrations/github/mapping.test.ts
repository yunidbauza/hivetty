// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  collectPrs,
  collectSearchPrs,
  commentAdded,
  countFindings,
  echoedId,
  echoedResolved,
  mutated,
  readPrId,
  readThreadPr,
  readViewerLogin,
  toChecks,
  toPrDetail,
  toPrTimeline,
  toPrRecord,
  toState,
} from '../../../../../electron/main/integrations/github/mapping';

/**
 * GitHub's GraphQL payload to named fields.
 *
 * A table, against recorded shapes. The module is pure — no I/O, and the clock
 * arrives as an argument — which is the whole reason the branchiest part of the
 * integration can be tested without a network.
 */

/** `2026-08-09T12:00:00Z`, as epoch ms. The "now" every case is relative to. */
const NOW = Date.parse('2026-08-09T12:00:00Z');

const node = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
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
  reviewThreads: { nodes: [] },
  commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
  ...over,
});

describe('readViewerLogin', () => {
  it('reads the account the token belongs to', () => {
    expect(readViewerLogin({ viewer: { login: 'octocat' } })).toBe('octocat');
  });

  it.each([undefined, null, {}, { viewer: null }, { viewer: { login: '  ' } }])(
    'answers null for %s',
    (payload) => {
      expect(readViewerLogin(payload)).toBeNull();
    },
  );
});

describe('toState', () => {
  it('reads a merged PR as merged, whatever else it says', () => {
    expect(toState(node({ state: 'MERGED', isDraft: true }))).toBe('merged');
  });

  /**
   * Draft beats approved. A draft cannot be merged, so showing "approved" on
   * one would name the wrong blocker.
   */
  it('reads a draft as draft even when approved', () => {
    expect(toState(node({ isDraft: true, reviewDecision: 'APPROVED' }))).toBe(
      'draft',
    );
  });

  it('reads an approved PR as approved', () => {
    expect(toState(node({ reviewDecision: 'APPROVED' }))).toBe('approved');
  });

  it.each([null, 'REVIEW_REQUIRED', 'CHANGES_REQUESTED'])(
    'reads reviewDecision %s as open',
    (reviewDecision) => {
      expect(toState(node({ reviewDecision }))).toBe('open');
    },
  );

  it('reads an unreadable node as open rather than throwing', () => {
    expect(toState('not a node')).toBe('open');
  });
});

describe('countFindings', () => {
  it('counts only the unresolved threads', () => {
    const raw = node({
      reviewThreads: {
        nodes: [
          { isResolved: false },
          { isResolved: true },
          { isResolved: false },
        ],
      },
    });

    expect(countFindings(raw)).toBe(2);
  });

  /**
   * Outdated threads count. GitHub marks a thread outdated when the code under
   * it moves, which is what happens when an agent pushes a fix *without*
   * resolving the conversation — exactly the case the badge exists to catch.
   */
  it('counts an outdated but unresolved thread', () => {
    const raw = node({
      reviewThreads: { nodes: [{ isResolved: false, isOutdated: true }] },
    });

    expect(countFindings(raw)).toBe(1);
  });

  it.each([
    ['no threads', node({ reviewThreads: { nodes: [] } })],
    ['a null connection', node({ reviewThreads: null })],
    ['a missing field', node({ reviewThreads: undefined })],
  ])('answers 0 for %s', (_label, raw) => {
    expect(countFindings(raw)).toBe(0);
  });
});

describe('toChecks', () => {
  const withRollup = (state: string | null) =>
    node({
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: state === null ? null : { state },
            },
          },
        ],
      },
    });

  it.each([
    ['SUCCESS', 'passing'],
    ['PENDING', 'running'],
    ['EXPECTED', 'running'],
    ['FAILURE', 'failing'],
    ['ERROR', 'failing'],
  ] as const)('reads %s as %s', (rollup, expected) => {
    expect(toChecks(withRollup(rollup))).toBe(expected);
  });

  /**
   * No rollup is `passing`, which is the state that produces **no badge**.
   *
   * That is a reading, not a shrug: `statusCheckRollup` is null for every PR in
   * a repository without CI, and mapping those to `running` would pin a
   * permanent "checks running" pill on them that could never resolve.
   */
  it('reads a repository with no checks as passing', () => {
    expect(toChecks(withRollup(null))).toBe('passing');
    expect(toChecks(node({ commits: { nodes: [] } }))).toBe('passing');
  });
});

describe('toPrRecord', () => {
  it('maps the named fields and nothing else', () => {
    expect(toPrRecord(node())).toEqual({
      number: 482,
      title: 'Hero: semantic token refactor',
      url: 'https://github.com/acme/nova-web/pull/482',
      repo: 'nova-web',
      owner: 'acme',
      branch: 'feat/hero-refresh',
      state: 'open',
      findings: 0,
      checks: 'passing',
      updatedAt: '2026-08-09T11:00:00Z',
      mergedAt: null,
      mine: false,
    });
  });

  /**
   * The repository comes off the node now, because search answers with one flat
   * list spanning every repo in the expression — there is no index left that
   * says where a result came from. A node that cannot say is one this app has
   * nowhere to put.
   */
  it('takes the repository from the node itself', () => {
    const record = toPrRecord(
      node({ repository: { name: 'referral-api', owner: { login: 'other' } } }),
    );

    expect(record).toMatchObject({ repo: 'referral-api', owner: 'other' });
  });

  /**
   * A PR it cannot read costs itself and nothing else. A sweep of forty where
   * the ninth has no branch renders thirty-nine rows, not an error.
   */
  it.each([
    ['no number', { number: undefined }],
    ['a fractional number', { number: 4.5 }],
    ['no title', { title: '' }],
    ['no url', { url: null }],
    ['no branch', { headRefName: undefined }],
    ['no updatedAt', { updatedAt: '   ' }],
    ['no repository', { repository: undefined }],
    ['a null repository', { repository: null }],
    ['a repository with no name', { repository: { owner: { login: 'acme' } } }],
    ['a repository with no owner', { repository: { name: 'nova-web' } }],
  ])('answers null for a node with %s', (_label, over) => {
    expect(toPrRecord(node(over))).toBeNull();
  });

  /**
   * A search over `type: ISSUE` also answers with issues, which the inline
   * `... on PullRequest` fragment leaves as bare `{}`. That is a routine
   * outcome here rather than a corruption.
   */
  it('answers null for something that is not a pull request', () => {
    expect(toPrRecord({})).toBeNull();
    expect(toPrRecord(null)).toBeNull();
    expect(toPrRecord([1, 2])).toBeNull();
  });
});

describe('collectPrs', () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    viewer: { login: 'octocat' },
    open: { nodes: [node()] },
    merged: { nodes: [] },
    ...over,
  });

  it('reads both search connections', () => {
    const prs = collectPrs(payload(), 'octocat', NOW);

    expect(prs.map((pr) => pr.number)).toEqual([482]);
  });

  /**
   * The search already asked for `author:@me`, so this is the second of two
   * independent mechanisms rather than the one that defines the list. It is kept
   * because it costs a comparison and it is what would catch a search expression
   * that failed to scope the way it was meant to.
   */
  it('drops PRs authored by anyone else', () => {
    const prs = collectPrs(
      payload({ open: { nodes: [node({ author: { login: 'someone' } })] } }),
      'octocat',
      NOW,
    );

    expect(prs).toEqual([]);
  });

  /**
   * The nodes now span every repository in one list, so the records have to come
   * out attributed individually.
   */
  it('attributes each node to its own repository', () => {
    const prs = collectPrs(
      payload({
        open: {
          nodes: [
            node({ number: 1, updatedAt: '2026-08-09T09:00:00Z' }),
            node({
              number: 2,
              updatedAt: '2026-08-09T11:30:00Z',
              repository: { name: 'referral-api', owner: { login: 'other' } },
            }),
          ],
        },
      }),
      'octocat',
      NOW,
    );

    expect(prs.map((pr) => [pr.number, pr.repo])).toEqual([
      [2, 'referral-api'],
      [1, 'nova-web'],
    ]);
  });

  it('keeps a PR merged inside the 24h window', () => {
    const prs = collectPrs(
      payload({
        open: { nodes: [] },
        merged: {
          nodes: [
            node({
              number: 77,
              state: 'MERGED',
              mergedAt: '2026-08-09T02:00:00Z',
            }),
          ],
        },
      }),
      'octocat',
      NOW,
    );

    expect(prs.map((pr) => pr.number)).toEqual([77]);
    expect(prs[0].state).toBe('merged');
  });

  it('drops a PR merged before the window', () => {
    const prs = collectPrs(
      payload({
        open: { nodes: [] },
        merged: {
          nodes: [
            node({
              number: 77,
              state: 'MERGED',
              mergedAt: '2026-08-07T02:00:00Z',
            }),
          ],
        },
      }),
      'octocat',
      NOW,
    );

    expect(prs).toEqual([]);
  });

  it('drops a merged PR with an unreadable mergedAt', () => {
    const prs = collectPrs(
      payload({
        open: { nodes: [] },
        merged: {
          nodes: [node({ state: 'MERGED', mergedAt: 'the day before' })],
        },
      }),
      'octocat',
      NOW,
    );

    expect(prs).toEqual([]);
  });

  /**
   * Live work first, then what landed — each group newest first. Sorting by
   * time alone would let a PR merged five minutes ago sit above one waiting on
   * the user right now.
   */
  it('orders live work above merged, each newest first', () => {
    const prs = collectPrs(
      payload({
        open: {
          nodes: [
            node({ number: 1, updatedAt: '2026-08-09T09:00:00Z' }),
            node({ number: 2, updatedAt: '2026-08-09T11:30:00Z' }),
          ],
        },
        merged: {
          nodes: [
            node({
              number: 3,
              state: 'MERGED',
              updatedAt: '2026-08-09T11:59:00Z',
              mergedAt: '2026-08-09T11:59:00Z',
            }),
          ],
        },
      }),
      'octocat',
      NOW,
    );

    expect(prs.map((pr) => pr.number)).toEqual([2, 1, 3]);
  });

  /**
   * Partial data survives. GraphQL answers a field it could not resolve with
   * `null` and an error beside it, while the sibling field carries real nodes;
   * losing the half that answered would be the wrong trade.
   */
  it('keeps the connection that answered when its sibling did not', () => {
    const prs = collectPrs(payload({ merged: null }), 'octocat', NOW);

    expect(prs.map((pr) => pr.number)).toEqual([482]);
  });

  it.each([
    ['a missing connection', { open: undefined }],
    ['a connection with no nodes array', { open: { nodes: null } }],
  ])('contributes nothing for %s', (_label, over) => {
    const prs = collectPrs(payload(over), 'octocat', NOW);

    expect(prs).toEqual([]);
  });

  it('answers an empty list for a payload it cannot read', () => {
    expect(collectPrs(null, 'octocat', NOW)).toEqual([]);
  });
});

/**
 * The search reading of the same payload.
 *
 * Every test here is about a filter that is deliberately **absent**, because
 * each one would silently discard exactly what the user asked for.
 */
describe('collectSearchPrs', () => {
  const NODE = {
    number: 482,
    title: 'carapace plates',
    url: 'https://github.com/acme/nova-web/pull/482',
    isDraft: false,
    state: 'OPEN',
    reviewDecision: null,
    headRefName: 'feat/plates',
    updatedAt: '2026-08-10T10:00:00Z',
    mergedAt: null,
    author: { login: 'someone-else' },
    repository: { name: 'nova-web', owner: { login: 'acme' } },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
  };

  it('keeps a PR written by someone else', () => {
    const prs = collectSearchPrs({ open: { nodes: [NODE] }, merged: { nodes: [] } });

    // The author check `collectPrs` applies would discard every result a search
    // exists to find.
    expect(prs.map((pr) => pr.number)).toEqual([482]);
  });

  it('keeps a merged PR however old it is', () => {
    const ancient = {
      ...NODE,
      number: 12,
      state: 'MERGED',
      mergedAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    };

    const prs = collectSearchPrs({ open: { nodes: [] }, merged: { nodes: [ancient] } });

    // The sweep's twenty-four hour window is about a *standing list*. A search
    // is a question, and hiding the answer would look like a broken search.
    expect(prs.map((pr) => pr.number)).toEqual([12]);
  });

  it('stacks open above merged, newest first within each', () => {
    const prs = collectSearchPrs({
      open: {
        nodes: [
          { ...NODE, number: 1, updatedAt: '2026-08-09T09:00:00Z' },
          { ...NODE, number: 2, updatedAt: '2026-08-10T09:00:00Z' },
        ],
      },
      merged: {
        nodes: [
          {
            ...NODE,
            number: 3,
            state: 'MERGED',
            mergedAt: '2026-08-10T08:00:00Z',
          },
        ],
      },
    });

    expect(prs.map((pr) => pr.number)).toEqual([2, 1, 3]);
  });

  it('answers empty for a payload with nothing in it', () => {
    expect(collectSearchPrs(null)).toEqual([]);
    expect(collectSearchPrs({})).toEqual([]);
  });
});

describe('mergedAt and mine (HIVE-215)', () => {
  it('keeps mergedAt on a merged PR and null on an open one', () => {
    const merged = toPrRecord(node({ state: 'MERGED', mergedAt: '2026-08-09T11:32:00Z' }));
    expect(merged?.mergedAt).toBe('2026-08-09T11:32:00Z');
    expect(toPrRecord(node())?.mergedAt).toBeNull();
  });

  it('marks every sweep record mine', () => {
    const prs = collectPrs(
      { viewer: { login: 'octocat' }, open: { nodes: [node()] }, merged: { nodes: [] } },
      'octocat',
      NOW,
    );
    expect(prs.map((pr) => pr.mine)).toEqual([true]);
  });

  it('marks a search result mine only when the viewer wrote it', () => {
    const prs = collectSearchPrs({
      viewer: { login: 'octocat' },
      open: {
        nodes: [
          node({ number: 1, author: { login: 'octocat' } }),
          node({ number: 2, author: { login: 'someone-else' } }),
        ],
      },
      merged: { nodes: [] },
    });
    expect(prs.map((pr) => [pr.number, pr.mine])).toEqual([[1, true], [2, false]]);
  });

  it('marks nothing mine in a search whose payload names no viewer', () => {
    const prs = collectSearchPrs({ open: { nodes: [node()] }, merged: { nodes: [] } });
    expect(prs[0]?.mine).toBe(false);
  });
});

describe('toPrDetail (HIVE-205)', () => {
  const pr = (over: Record<string, unknown> = {}) => ({
    id: 'PR_kwDO1',
    number: 1182,
    title: 'Fee rule validator',
    url: 'https://github.com/acme/server/pull/1182',
    state: 'OPEN',
    isDraft: false,
    body: 'Validates **every** filing.\n\n- [x] corporations\n- [ ] LLCs',
    createdAt: '2026-10-03T08:00:00Z',
    mergedAt: null,
    baseRefName: 'main',
    headRefName: 'feat/fee-rule',
    headRefOid: '9f3c2ab',
    additions: 214,
    deletions: 38,
    changedFiles: 9,
    author: { login: 'octocat' },
    reviewDecision: 'CHANGES_REQUESTED',
    mergeStateStatus: null,
    comments: { nodes: [
      { author: { login: 'maria' }, body: 'Does this cover 2026?', createdAt: '2026-10-03T09:31:00Z', url: 'https://github.com/acme/server/pull/1182#issuecomment-1' },
      { author: null, body: 'from a deleted account', createdAt: '2026-10-03T09:40:00Z', url: 'https://github.com/acme/server/pull/1182#issuecomment-2' },
      { author: { login: 'x' }, body: 'no url', createdAt: '2026-10-03T09:41:00Z' },
    ] },
    reviews: { nodes: [
      { author: { login: 'acr-bot' }, state: 'CHANGES_REQUESTED', body: 'Three findings.', submittedAt: '2026-10-03T08:50:00Z', url: 'https://github.com/acme/server/pull/1182#pullrequestreview-7' },
      { author: { login: 'octocat' }, state: 'PENDING', body: '', submittedAt: null, url: 'https://github.com/acme/server/pull/1182#pullrequestreview-8' },
    ] },
    reviewRequests: { nodes: [] },
    reviewThreads: { nodes: [] },
    commits: { nodes: [] },
    ...over,
  });
  const payload = (node: unknown) => ({ repository: { pullRequest: node } });

  it('maps the scalars, keeping the configured owner and repo', () => {
    expect(toPrDetail(payload(pr()), 'acme', 'server')).toMatchObject({
      id: 'PR_kwDO1', owner: 'acme', repo: 'server', number: 1182, title: 'Fee rule validator',
      state: 'open', isDraft: false, createdAt: '2026-10-03T08:00:00Z', mergedAt: null,
      baseRef: 'main', headRef: 'feat/fee-rule', headSha: '9f3c2ab',
      additions: 214, deletions: 38, changedFiles: 9, author: 'octocat',
      reviewDecision: 'CHANGES_REQUESTED', mergeStateStatus: null,
    });
  });

  it('maps the changed files, GitHub’s viewed state included (HIVE-207)', () => {
    const detail = toPrDetail(payload(pr({ files: { nodes: [
      { path: 'src/a.ts', additions: 3, deletions: 1, changeType: 'MODIFIED', viewerViewedState: 'VIEWED' },
      { path: 'src/b.ts', additions: 0, deletions: 0, changeType: 'RENAMED', viewerViewedState: 'DISMISSED' },
      { path: 'src/c.ts', additions: null, deletions: 2, changeType: null, viewerViewedState: 'UNVIEWED' },
      { additions: 1 },
      null,
    ] } })), 'acme', 'server');
    expect(detail?.files).toEqual([
      { path: 'src/a.ts', additions: 3, deletions: 1, changeType: 'modified', viewed: 'viewed' },
      { path: 'src/b.ts', additions: 0, deletions: 0, changeType: 'renamed', viewed: 'dismissed' },
      { path: 'src/c.ts', additions: 0, deletions: 2, changeType: 'modified', viewed: 'unviewed' },
    ]);
  });

  it('has no files when GitHub sent none (HIVE-207)', () => {
    expect(toPrDetail(payload(pr()), 'acme', 'server')?.files).toEqual([]);
  });

  it('reads MERGED and CLOSED, and nulls as nulls or zero', () => {
    expect(toPrDetail(payload(pr({ state: 'MERGED', mergedAt: '2026-10-03T11:32:00Z' })), 'acme', 'server'))
      .toMatchObject({ state: 'merged', mergedAt: '2026-10-03T11:32:00Z' });
    expect(toPrDetail(payload(pr({ state: 'CLOSED', author: null, body: null, additions: null, baseRefName: null })), 'acme', 'server'))
      .toMatchObject({ state: 'closed', author: null, body: '', additions: 0, baseRef: null });
  });

  it('keeps a ghost author as null and drops a comment it cannot place', () => {
    const detail = toPrDetail(payload(pr()), 'acme', 'server');
    expect(detail?.comments.map((comment) => comment.author)).toEqual(['maria', null]);
  });

  it('keeps submitted reviews and leaves the pending draft out', () => {
    const detail = toPrDetail(payload(pr()), 'acme', 'server');
    expect(detail?.reviews).toEqual([
      { author: 'acr-bot', state: 'CHANGES_REQUESTED', body: 'Three findings.', submittedAt: '2026-10-03T08:50:00Z', url: 'https://github.com/acme/server/pull/1182#pullrequestreview-7' },
    ]);
  });

  it('answers null with no pull request, or one missing a required field', () => {
    expect(toPrDetail(payload(null), 'acme', 'server')).toBeNull();
    expect(toPrDetail({ repository: null }, 'acme', 'server')).toBeNull();
    expect(toPrDetail(payload(pr({ id: null })), 'acme', 'server')).toBeNull();
    expect(toPrDetail(undefined, 'acme', 'server')).toBeNull();
  });

  it('maps threads with their hunks, a null line once outdated', () => {
    const detail = toPrDetail(payload(pr({ reviewThreads: { nodes: [
      { id: 'T1', isResolved: false, isOutdated: true, path: 'src/fees/validator.ts', line: null, originalLine: 118, diffSide: 'RIGHT',
        comments: { nodes: [{ author: { login: 'acr-bot' }, body: 'An LLC without an agent passes.', createdAt: '2026-10-03T08:50:00Z', url: 'https://github.com/acme/server/pull/1182#discussion_r1', diffHunk: '@@ -116,3 +116,3 @@\n if (llc) return ok();' }] } },
      { id: 'T2', isResolved: true, isOutdated: false, path: 'a.ts', line: 3, originalLine: 3, diffSide: null, comments: { nodes: [{ author: null, body: 'x', createdAt: '2026-10-03T08:51:00Z', url: 'https://u/2' }] } },
      { id: null, path: 'dropped.ts' },
    ] } })), 'acme', 'server');

    expect(detail?.threads).toEqual([
      { id: 'T1', isResolved: false, isOutdated: true, path: 'src/fees/validator.ts', line: null, originalLine: 118, diffSide: 'RIGHT',
        comments: [{ author: 'acr-bot', body: 'An LLC without an agent passes.', createdAt: '2026-10-03T08:50:00Z', url: 'https://github.com/acme/server/pull/1182#discussion_r1', diffHunk: '@@ -116,3 +116,3 @@\n if (llc) return ok();' }] },
      { id: 'T2', isResolved: true, isOutdated: false, path: 'a.ts', line: 3, originalLine: 3, diffSide: null,
        comments: [{ author: null, body: 'x', createdAt: '2026-10-03T08:51:00Z', url: 'https://u/2', diffHunk: '' }] },
    ]);
  });

  it('reads check runs and commit statuses as one shape', () => {
    const contexts = { nodes: [
      { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-10-03T10:00:00Z', completedAt: '2026-10-03T10:01:00Z', detailsUrl: 'https://ci/1' },
      { __typename: 'CheckRun', name: 'integration', status: 'COMPLETED', conclusion: 'TIMED_OUT', startedAt: null, completedAt: null, detailsUrl: null },
      { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-10-03T10:02:00Z', completedAt: null, detailsUrl: 'https://ci/3' },
      { __typename: 'CheckRun', name: 'build', status: 'QUEUED', conclusion: null },
      { __typename: 'CheckRun', name: 'docs', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { __typename: 'StatusContext', context: 'vercel', state: 'PENDING', targetUrl: 'https://v/1', createdAt: '2026-10-03T10:03:00Z' },
      { __typename: 'StatusContext', context: 'legacy', state: 'ERROR', targetUrl: null, createdAt: null },
      { __typename: 'CheckRun', name: null, status: 'COMPLETED' },
    ] };
    const detail = toPrDetail(payload(pr({ commits: { nodes: [{ commit: { statusCheckRollup: { contexts } } }] } })), 'acme', 'server');

    expect(detail?.checks).toEqual([
      { name: 'lint', status: 'success', startedAt: '2026-10-03T10:00:00Z', completedAt: '2026-10-03T10:01:00Z', url: 'https://ci/1', app: null, jobId: null },
      { name: 'integration', status: 'failure', startedAt: null, completedAt: null, url: null, app: null, jobId: null },
      { name: 'e2e', status: 'running', startedAt: '2026-10-03T10:02:00Z', completedAt: null, url: 'https://ci/3', app: null, jobId: null },
      { name: 'build', status: 'queued', startedAt: null, completedAt: null, url: null, app: null, jobId: null },
      { name: 'docs', status: 'neutral', startedAt: null, completedAt: null, url: null, app: null, jobId: null },
      { name: 'vercel', status: 'running', startedAt: '2026-10-03T10:03:00Z', completedAt: null, url: 'https://v/1', app: null, jobId: null },
      { name: 'legacy', status: 'failure', startedAt: null, completedAt: null, url: null, app: null, jobId: null },
    ]);
  });

  it('has no checks when the head commit has no rollup', () => {
    expect(toPrDetail(payload(pr({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })), 'acme', 'server')?.checks).toEqual([]);
  });

  describe('check app and job id (HIVE-206)', () => {
    const rollup = (nodes: unknown[]) => payload(pr({ commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes } } } }] } }));

    it('reads an Actions check run’s job id and app', () => {
      const detail = toPrDetail(rollup([{ __typename: 'CheckRun', name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS',
        startedAt: null, completedAt: null, detailsUrl: 'https://x', databaseId: 991, checkSuite: { app: { slug: 'github-actions' } } }]), 'acme', 'nova');
      expect(detail?.checks[0]).toMatchObject({ app: 'github-actions', jobId: 991 });
    });

    it('keeps a third-party check run’s app and gives it no job id', () => {
      const detail = toPrDetail(rollup([{ __typename: 'CheckRun', name: 'netlify', status: 'COMPLETED', conclusion: 'SUCCESS',
        databaseId: 5, checkSuite: { app: { slug: 'netlify' } } }]), 'acme', 'nova');
      expect(detail?.checks[0]).toMatchObject({ app: 'netlify', jobId: null });
    });

    it('gives a commit status neither', () => {
      const detail = toPrDetail(rollup([{ __typename: 'StatusContext', context: 'ci/legacy', state: 'SUCCESS', targetUrl: null, createdAt: null }]), 'acme', 'nova');
      expect(detail?.checks[0]).toMatchObject({ app: null, jobId: null });
    });
  });

  it('names requested users by login and teams by name', () => {
    const detail = toPrDetail(payload(pr({ reviewRequests: { nodes: [
      { requestedReviewer: { login: 'maria' } },
      { requestedReviewer: { name: 'platform' } },
      { requestedReviewer: null },
    ] } })), 'acme', 'server');
    expect(detail?.reviewRequests).toEqual(['maria', 'platform']);
  });

  it('reads the node id, and whether a comment was added', () => {
    expect(readPrId(payload({ id: 'PR_kwDO1' }))).toBe('PR_kwDO1');
    expect(readPrId(payload(null))).toBeNull();
    expect(commentAdded({ addComment: { subject: { id: 'PR_kwDO1' } } })).toBe(true);
    expect(commentAdded({ addComment: null })).toBe(false);
    expect(commentAdded(undefined)).toBe(false);
  });
});

describe('readThreadPr and mutated (HIVE-207)', () => {
  it('reads the PR a thread is on', () => {
    expect(readThreadPr({ node: { pullRequest: { number: 482, repository: { owner: { login: 'acme' }, name: 'nova-web' } } } }))
      .toEqual({ owner: 'acme', name: 'nova-web', number: 482 });
  });
  it.each([[null], [{ node: null }], [{ node: {} }], [{ node: { pullRequest: { number: 1 } } }]])('is null for %j', (payload) => {
    expect(readThreadPr(payload)).toBeNull();
  });
  it('says whether a mutation answered with its field', () => {
    expect(mutated({ resolveReviewThread: { thread: { id: 'T' } } }, 'resolveReviewThread')).toBe(true);
    expect(mutated({ resolveReviewThread: null }, 'resolveReviewThread')).toBe(false);
    expect(mutated(undefined, 'resolveReviewThread')).toBe(false);
  });
  it('reads success from the echo, never from a hollow answer', () => {
    const resolvedTo = (to: boolean) => (answer: Record<string, unknown>) => echoedResolved(answer, to);
    expect(mutated({ resolveReviewThread: { thread: { id: 'T', isResolved: true } } }, 'resolveReviewThread', resolvedTo(true))).toBe(true);
    expect(mutated({ resolveReviewThread: { thread: { id: 'T', isResolved: false } } }, 'resolveReviewThread', resolvedTo(true))).toBe(false);
    expect(mutated({ resolveReviewThread: { thread: null } }, 'resolveReviewThread', resolvedTo(true))).toBe(false);
    expect(echoedId({ comment: { id: 'C' } }, 'comment')).toBe(true);
    expect(echoedId({ comment: null }, 'comment')).toBe(false);
    expect(echoedId({ comment: { id: 7 } }, 'comment')).toBe(false);
  });
});

describe('toPrTimeline (HIVE-208)', () => {
  const suite = (over: Record<string, unknown>) => ({
    status: 'COMPLETED', conclusion: 'SUCCESS', createdAt: '2026-10-03T12:01:00Z', updatedAt: '2026-10-03T12:12:00Z',
    workflowRun: { runNumber: 2198, url: 'https://github.com/acme/server/actions/runs/9', databaseId: 9, workflow: { name: 'CI' } },
    checkRuns: { nodes: [] }, ...over,
  });
  const payload = (nodes: unknown[], over: Record<string, unknown> = {}) => ({ repository: { pullRequest: {
    createdAt: '2026-10-03T11:00:00Z', mergedAt: null, isDraft: false, timelineItems: { nodes }, ...over } } });

  it('maps commits, their workflow suites to runs, reviews, comments and events', () => {
    const timeline = toPrTimeline(payload([
      { __typename: 'PullRequestCommit', url: 'https://github.com/acme/server/pull/1182/commits/7c21e0f', commit: { oid: '7c21e0f', committedDate: '2026-10-03T12:00:00Z', checkSuites: { nodes: [
        suite({}),
        suite({ conclusion: 'FAILURE', workflowRun: { runNumber: 2204, url: 'u2', databaseId: 10, workflow: { name: 'CI' } }, checkRuns: { nodes: [{ name: 'integration' }] } }),
        suite({ status: 'IN_PROGRESS', conclusion: null, workflowRun: { runNumber: 2210, url: 'u3', databaseId: 11, workflow: { name: 'CI' } } }),
        suite({ workflowRun: null }),
      ] } } },
      { __typename: 'ReadyForReviewEvent', createdAt: '2026-10-03T12:00:00Z', actor: { login: 'shipper-bot' } },
      { __typename: 'PullRequestReview', submittedAt: '2026-10-03T12:38:00Z', author: { login: 'acr-bot' }, state: 'CHANGES_REQUESTED', url: 'https://github.com/acme/server/pull/1182#pullrequestreview-1' },
      { __typename: 'IssueComment', createdAt: '2026-10-03T13:31:00Z', author: { login: 'maria' }, url: 'https://github.com/acme/server/pull/1182#issuecomment-1' },
      { __typename: 'MergedEvent', createdAt: '2026-10-03T14:00:00Z', actor: null },
    ]));
    expect(timeline).toMatchObject({
      createdAt: '2026-10-03T11:00:00Z', mergedAt: null, isDraft: false,
      commits: [{ oid: '7c21e0f', at: '2026-10-03T12:00:00Z', url: 'https://github.com/acme/server/pull/1182/commits/7c21e0f' }],
      reviews: [{ at: '2026-10-03T12:38:00Z', author: 'acr-bot', state: 'CHANGES_REQUESTED' }],
      comments: [{ at: '2026-10-03T13:31:00Z', author: 'maria' }],
      events: [{ kind: 'ready', actor: 'shipper-bot' }, { kind: 'merged', actor: null }],
    });
    expect(timeline?.runs).toEqual([
      { id: 9, number: 2198, url: 'https://github.com/acme/server/actions/runs/9', sha: '7c21e0f', workflow: 'CI', startedAt: '2026-10-03T12:01:00Z', endedAt: '2026-10-03T12:12:00Z', state: 'passed', failedJobs: [] },
      { id: 10, number: 2204, url: 'u2', sha: '7c21e0f', workflow: 'CI', startedAt: '2026-10-03T12:01:00Z', endedAt: '2026-10-03T12:12:00Z', state: 'failed', failedJobs: ['integration'] },
      { id: 11, number: 2210, url: 'u3', sha: '7c21e0f', workflow: 'CI', startedAt: '2026-10-03T12:01:00Z', endedAt: null, state: 'running', failedJobs: [] },
    ]);
  });

  it('is null without a pull request or its createdAt, and drops unreadable items', () => {
    expect(toPrTimeline({ repository: null })).toBeNull();
    expect(toPrTimeline(payload([], { createdAt: null }))).toBeNull();
    expect(toPrTimeline(payload([{ __typename: 'IssueComment' }, { __typename: 'Mystery' }, null]))).toMatchObject({ comments: [], commits: [], events: [] });
  });
});
