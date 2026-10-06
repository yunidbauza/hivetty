// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildPrQuery,
  buildPrVariables,
  buildSearchVariables,
  FILE_UNVIEWED_MUTATION,
  FILE_VIEWED_MUTATION,
  PR_COMMENT_MUTATION,
  PR_DETAIL_QUERY,
  PR_ID_QUERY,
  PR_THREAD_OWNER_QUERY,
  PR_TIMELINE_QUERY,
  repoQualifiers,
  THREAD_REPLY_MUTATION,
  THREAD_RESOLVE_MUTATION,
  THREAD_UNRESOLVE_MUTATION,
  safeSearchTerm,
  type RepoRef,
} from '../../../../../electron/main/integrations/github/query';

/**
 * The document, the author filter, and the promise that a repository name can
 * only ever be data.
 *
 * That promise is the security-relevant part of this module, so it is asserted
 * directly rather than inferred from the shape of the code — and it now has two
 * halves, because a name travels through two languages: GraphQL, where it is a
 * bound variable, and GitHub's search expression, where it is a `repo:`
 * qualifier and has to be vetted instead.
 */
describe('buildPrQuery', () => {
  /**
   * The whole point of the change. `Repository.pullRequests` has no author
   * argument, so a query built on it can only filter after GitHub has already
   * chosen the page — which is how a user's own PRs went missing from a busy
   * repository.
   */
  it('asks GitHub for the viewer’s own pull requests', () => {
    const { open, merged } = buildPrVariables(['repo:acme/nova-web']);

    expect(open).toContain('author:@me');
    expect(merged).toContain('author:@me');
    expect(buildPrQuery()).toContain('search(query: $open, type: ISSUE');
    expect(buildPrQuery()).toContain('search(query: $merged, type: ISSUE');
  });

  /**
   * The document no longer varies with the configuration at all. There is no
   * per-repo aliasing left to generate, so there is nowhere for a config value
   * to land even by accident.
   */
  it('is a constant, whatever the configuration is', () => {
    expect(buildPrQuery()).toBe(buildPrQuery());
    expect(buildPrQuery()).toContain('query($open: String!, $merged: String!)');
  });

  it('asks who the token belongs to in the same round trip', () => {
    expect(buildPrQuery()).toContain('viewer { login }');
  });

  it('asks for the fields the badges are made of', () => {
    const query = buildPrQuery();

    expect(query).toContain('reviewThreads(first: 100)');
    expect(query).toContain('statusCheckRollup');
    expect(query).toContain('reviewDecision');
    expect(query).toContain('isDraft');
    expect(query).toContain('mergedAt');
  });

  /**
   * A search result is not addressed by repository the way an aliased block was
   * — the nodes arrive in one flat list — so each has to say where it came from.
   */
  it('asks each node which repository it came from', () => {
    expect(buildPrQuery()).toContain('repository { name owner { login } }');
  });

  /**
   * Two searches, not one. A single connection ordered by `updated-desc` across
   * both states would let a busy week of merges push the user's open PRs off
   * the page, and those are the point of the panel.
   */
  it('pages open and merged separately', () => {
    const query = buildPrQuery();
    const { open, merged } = buildPrVariables(['repo:acme/nova-web']);

    expect(query).toContain('open: search(query: $open, type: ISSUE, first: 100)');
    expect(query).toContain(
      'merged: search(query: $merged, type: ISSUE, first: 100)',
    );
    expect(open).toContain('is:open');
    expect(merged).toContain('is:merged');
  });

  /** Search defaults to relevance, which is not a thing a PR panel means. */
  it('orders both searches by when they were last updated', () => {
    const { open, merged } = buildPrVariables(['repo:acme/nova-web']);

    expect(open).toContain('sort:updated-desc');
    expect(merged).toContain('sort:updated-desc');
  });

  /**
   * The twenty-four hour merged window belongs to `mapping.ts`, where it is
   * applied to `mergedAt`. An `updated:` qualifier here would answer a different
   * question — "was this touched recently" — and drop a PR for being quiet.
   */
  it('puts no date qualifier in either expression', () => {
    const { open, merged } = buildPrVariables(['repo:acme/nova-web']);

    expect(open).not.toContain('updated:');
    expect(merged).not.toContain('updated:');
    expect(open).not.toContain('created:');
    expect(merged).not.toContain('created:');
  });
});

describe('repoQualifiers', () => {
  it('scopes the search to each configured repository', () => {
    expect(
      repoQualifiers([
        { owner: 'acme', name: 'nova-web' },
        { owner: 'other', name: 'referral-api' },
      ]),
    ).toEqual(['repo:acme/nova-web', 'repo:other/referral-api']);
  });

  /**
   * The guarantee, restated for the language a name now actually enters.
   *
   * A name cannot reach the GraphQL document — that is structural, the document
   * is a constant. What it *can* reach is the search expression, where a space
   * would end the `repo:` qualifier and start another one. So a name outside the
   * character set GitHub itself permits is dropped rather than escaped: a
   * repository missing from the sweep shows fewer PRs, where a mis-escaped one
   * could widen the search to show anybody's.
   */
  it.each([
    ['a smuggled qualifier', { owner: 'acme', name: 'web is:public' }],
    ['a smuggled author', { owner: 'acme', name: 'web author:someone' }],
    ['a slash', { owner: 'acme', name: 'web/extra' }],
    ['a quote', { owner: 'acme', name: 'web"' }],
    ['a hostile owner', { owner: 'acme is:public', name: 'nova-web' }],
    ['an empty name', { owner: 'acme', name: '' }],
  ])('drops a repository with %s', (_label, repo: RepoRef) => {
    expect(repoQualifiers([repo])).toEqual([]);
  });

  /** The full set GitHub permits, so no real repository is dropped. */
  it('keeps dots, dashes and underscores', () => {
    expect(
      repoQualifiers([{ owner: 'a-cme_1', name: 'web.js_2-x' }]),
    ).toEqual(['repo:a-cme_1/web.js_2-x']);
  });

  /**
   * The empty list is load-bearing, and `client.ts` is the one that acts on it:
   * an `author:@me` search with no `repo:` scope is a valid query that answers
   * with the user's PRs from every repository they have ever touched.
   */
  it('answers empty when nothing is safe to ask about', () => {
    expect(repoQualifiers([])).toEqual([]);
    expect(repoQualifiers([{ owner: 'a b', name: 'c d' }])).toEqual([]);
  });
});

describe('buildPrVariables', () => {
  it('binds both expressions, scoped to every repository', () => {
    const variables = buildPrVariables([
      'repo:acme/nova-web',
      'repo:other/referral-api',
    ]);

    expect(variables).toEqual({
      open: 'is:pr author:@me is:open repo:acme/nova-web repo:other/referral-api sort:updated-desc',
      merged:
        'is:pr author:@me is:merged repo:acme/nova-web repo:other/referral-api sort:updated-desc',
    });
  });

  /**
   * Repeated `repo:` qualifiers are OR-ed by GitHub's search, which is what lets
   * one round trip cover every configured project — verified against the real
   * API, not only asserted here.
   */
  it('lists every repository in one expression', () => {
    const { open } = buildPrVariables([
      'repo:a/one',
      'repo:b/two',
      'repo:c/three',
    ]);

    expect(open).toContain('repo:a/one repo:b/two repo:c/three');
  });
});

/**
 * The search half, added with the PRs panel's search row.
 *
 * Two claims, and both are about what a *user's words* can do to an expression
 * this app composed: they cannot become a qualifier, and they cannot leave the
 * configured repositories.
 */
describe('safeSearchTerm', () => {
  it('keeps ordinary words exactly as typed', () => {
    expect(safeSearchTerm('carapace plates')).toBe('carapace plates');
  });

  it('removes the colon, so a term cannot become a qualifier', () => {
    // The whole point. `repo:someone/else` in the box would otherwise widen the
    // search past the scope this app just chose.
    expect(safeSearchTerm('repo:someone/else')).toBe('repo someone/else');
    expect(safeSearchTerm('author:nobody carapace')).toBe('author nobody carapace');
  });

  /**
   * The sharp one. GitHub search has quoted phrases and **no escape
   * mechanism**, so a single unbalanced quote runs to the end of the expression
   * and swallows every `repo:` qualifier after it into literal text — a valid,
   * unscoped search across all of GitHub, reached from inside the search box.
   */
  it('removes the double quote, which would swallow the scope', () => {
    expect(safeSearchTerm('carapace "')).toBe('carapace');
    expect(safeSearchTerm('"a b')).toBe('a b');
  });

  it('removes parentheses, which group around a boolean', () => {
    expect(safeSearchTerm('(a OR b)')).toBe('a OR b');
  });

  it('collapses the whitespace a removal leaves behind', () => {
    expect(safeSearchTerm('  a::b   c  ')).toBe('a b c');
  });

  it('answers empty for a term of nothing but spaces', () => {
    expect(safeSearchTerm('   ')).toBe('');
  });
});

describe('buildSearchVariables', () => {
  const scope = repoQualifiers([
    { owner: 'behiques', name: 'the-hive' },
  ] as RepoRef[]);

  it('drops author:@me — a search is not about the user', () => {
    const variables = buildSearchVariables('carapace', scope);

    expect(variables.open).not.toContain('author:@me');
    expect(variables.merged).not.toContain('author:@me');
  });

  it('keeps the repo scope on both expressions', () => {
    const variables = buildSearchVariables('carapace', scope);

    // The invariant the panel promises: a search reaches the repositories the
    // config maps and no others, however wide the checkbox goes.
    expect(variables.open).toContain('repo:behiques/the-hive');
    expect(variables.merged).toContain('repo:behiques/the-hive');
  });

  it('asks for open and merged separately, newest first', () => {
    const variables = buildSearchVariables('carapace', scope);

    expect(variables.open).toContain('is:open');
    expect(variables.merged).toContain('is:merged');
    expect(variables.open).toContain('sort:updated-desc');
  });

  it('sanitises the term on the way in', () => {
    const variables = buildSearchVariables('repo:elsewhere/x', scope);

    // One `repo:` qualifier in the expression, and it is the one main composed.
    expect(variables.open.match(/repo:/gu)).toHaveLength(1);
    expect(variables.open).toContain('repo:behiques/the-hive');
  });

  /**
   * Two independent defences, asserted separately because either alone would
   * leave a hole.
   */
  it('cannot be escaped by an unbalanced quote', () => {
    const variables = buildSearchVariables('carapace "', scope);

    // Nothing the user typed can open a phrase, so nothing after it can be
    // swallowed into one.
    expect(variables.open).not.toContain('"');
    expect(variables.open).toContain('repo:behiques/the-hive');
  });

  it('emits the scope before anything the user typed', () => {
    const variables = buildSearchVariables('a OR b', scope);

    /*
      Ordering, not cosmetics. GitHub honours `OR` between terms, so with the
      term first `x OR y` splits into two disjuncts and only the second carries
      the qualifiers — the left one would search all of GitHub.
    */
    expect(variables.open.indexOf('repo:behiques/the-hive')).toBeLessThan(
      variables.open.indexOf('a OR b'),
    );
  });
});

describe('the PR page documents (HIVE-205)', () => {
  it.each([
    ['detail', PR_DETAIL_QUERY],
    ['id', PR_ID_QUERY],
  ])('the %s query binds owner, name and number as variables', (_name, doc) => {
    expect(doc).toContain('query($owner: String!, $name: String!, $number: Int!)');
    expect(doc).toContain('repository(owner: $owner, name: $name)');
    expect(doc).toContain('pullRequest(number: $number)');
  });

  it('adds a comment through bound variables only', () => {
    expect(PR_COMMENT_MUTATION).toContain('mutation($subjectId: ID!, $body: String!)');
    expect(PR_COMMENT_MUTATION).toContain('addComment(input: { subjectId: $subjectId, body: $body })');
  });

  it('reads the newest page of comments, reviews and threads, not the oldest', () => {
    // A PR past one page would otherwise lose exactly the entries the page is for.
    expect(PR_DETAIL_QUERY).toContain('comments(last: 100) { nodes { author { login } body createdAt url } }');
    expect(PR_DETAIL_QUERY).toContain('reviews(last: 100)');
    expect(PR_DETAIL_QUERY).toContain('reviewThreads(last: 100)');
  });

  it('selects each check run’s job id and app (HIVE-206)', () => {
    expect(PR_DETAIL_QUERY).toContain('... on CheckRun { name status conclusion startedAt completedAt detailsUrl databaseId checkSuite { app { slug } } }');
  });

  it('reads every field the page draws', () => {
    for (const field of [
      'body', 'createdAt', 'mergedAt', 'baseRefName', 'headRefName', 'headRefOid',
      'additions', 'deletions', 'changedFiles', 'author { login }', 'reviewDecision',
      'mergeStateStatus', 'reviewRequests', 'reviewThreads', 'isOutdated', 'originalLine',
      'diffSide', 'diffHunk', 'statusCheckRollup', '... on CheckRun', '... on StatusContext',
    ]) {
      expect(PR_DETAIL_QUERY).toContain(field);
    }
  });
});

describe('HIVE-207 documents', () => {
  it('reads the changed files with their viewed state', () => {
    expect(PR_DETAIL_QUERY).toContain('files(first: 100) { nodes { path additions deletions changeType viewerViewedState } }');
  });

  it.each([
    ['PR_THREAD_OWNER_QUERY', PR_THREAD_OWNER_QUERY, ['$id: ID!']],
    ['THREAD_REPLY_MUTATION', THREAD_REPLY_MUTATION, ['$threadId: ID!', '$body: String!', 'addPullRequestReviewThreadReply']],
    ['THREAD_RESOLVE_MUTATION', THREAD_RESOLVE_MUTATION, ['$threadId: ID!', 'resolveReviewThread']],
    ['THREAD_UNRESOLVE_MUTATION', THREAD_UNRESOLVE_MUTATION, ['$threadId: ID!', 'unresolveReviewThread']],
    ['FILE_VIEWED_MUTATION', FILE_VIEWED_MUTATION, ['$pullRequestId: ID!', '$path: String!', 'markFileAsViewed']],
    ['FILE_UNVIEWED_MUTATION', FILE_UNVIEWED_MUTATION, ['$pullRequestId: ID!', '$path: String!', 'unmarkFileAsViewed']],
  ])('%s declares its variables and binds nothing else', (_name, doc, parts) => {
    for (const part of parts) expect(doc).toContain(part);
    expect(doc).not.toMatch(/\$\{/);
  });
});

describe('PR_TIMELINE_QUERY (HIVE-208)', () => {
  it('binds owner, name and number and reads the timeline item types the tab draws', () => {
    expect(PR_TIMELINE_QUERY).toContain('query($owner: String!, $name: String!, $number: Int!)');
    expect(PR_TIMELINE_QUERY).toContain('timelineItems(last: 100, itemTypes: [PULL_REQUEST_COMMIT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, PULL_REQUEST_REVIEW, ISSUE_COMMENT, REVIEW_REQUESTED_EVENT, MERGED_EVENT])');
    expect(PR_TIMELINE_QUERY).toContain('checkSuites(first: 20)');
    expect(PR_TIMELINE_QUERY).toContain('workflowRun { runNumber url databaseId workflow { name } }');
    expect(PR_TIMELINE_QUERY).toContain('checkRuns(first: 10, filterBy: { conclusions: [FAILURE, TIMED_OUT] })');
    expect(PR_TIMELINE_QUERY).not.toMatch(/\$\{/);
  });
});
