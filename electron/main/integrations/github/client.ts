import type { GhError, GhResult, PrDetail, PrRecord, PrTimeline } from '../../../shared/github-contract';

import { classifyGhFailure, ghError } from './classify';
import {
  collectPrs,
  collectSearchPrs,
  commentAdded,
  echoedId,
  echoedResolved,
  hasAnyConnection,
  mutated,
  readPrId,
  readThreadPr,
  readViewerLogin,
  toPrDetail,
  toPrTimeline,
} from './mapping';
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
  safeSearchTerm,
  THREAD_REPLY_MUTATION,
  THREAD_RESOLVE_MUTATION,
  THREAD_UNRESOLVE_MUTATION,
  type RepoRef,
} from './query';
import type { RunAsync } from './run';

/**
 * The sweep: one `gh api graphql` call, one list of PRs.
 *
 * ## Why the payload beats the exit code
 *
 * `gh` exits non-zero whenever the GraphQL response carries an `errors` array —
 * including the case where it *also* carries perfectly good data. One of the two
 * search connections failing while the other answers is exactly that case:
 * GitHub sends `null` for the field it could not resolve, an error naming it,
 * and real nodes for the other. Reading the exit code first would throw the good
 * half away, so this reads the body first and only falls back to classifying a
 * failure when there is nothing usable in it.
 *
 * Note that an *inaccessible repository* no longer produces an error at all. A
 * `repo:` qualifier the token cannot see simply matches nothing, so one bad
 * project in the config now costs its own results and stays silent — where the
 * aliased-repository query it replaced would name it in `errors`.
 *
 * ## What is never returned
 *
 * `stdout` and `stderr` do not escape. Failures are named by
 * `classify.ts` from a classification of what happened — never assembled from
 * command output, which can contain a URL with a token in it if a user has
 * configured one that way.
 */

/** Enough of the response to tell "answered" from "failed". */
interface GraphqlBody {
  data?: unknown;
}

export interface GithubClient {
  /**
   * Read every PR across these repositories.
   *
   * `now` is a parameter rather than a `Date.now()` call so the merged window is
   * testable without a fake clock reaching into this module.
   */
  sweep(repos: readonly RepoRef[], now: number): Promise<GhResult<PrRecord[]>>;
  /**
   * Every PR matching `term` across these repositories, **whoever wrote it**.
   *
   * The same document and the same scoping as {@link GithubClient.sweep} — only
   * the search expressions differ, and only by dropping `author:@me` and adding
   * the user's words. It takes no `now`, because a search has no merged window:
   * see `collectSearchPrs`.
   */
  search(term: string, repos: readonly RepoRef[]): Promise<GhResult<PrRecord[]>>;
  /** One PR's page (HIVE-205). `repo` is the resolver's, never the renderer's spelling. */
  detail(repo: RepoRef, n: number): Promise<GhResult<PrDetail>>;
  /** One PR's history for the Timeline tab (HIVE-208): timeline items and each commit's check suites. */
  timeline(repo: RepoRef, n: number): Promise<GhResult<PrTimeline>>;
  /** A PR-level comment (HIVE-205): the PR's id is read from GitHub first, then `addComment`. */
  comment(repo: RepoRef, n: number, body: string): Promise<GhResult<true>>;
  /** The PR's unified diff (HIVE-207), as `gh pr diff` prints it. */
  diff(repo: RepoRef, n: number): Promise<GhResult<string>>;
  /** Reply to a review thread (HIVE-207), once the thread is proved to be on this PR. */
  threadReply(repo: RepoRef, n: number, threadId: string, body: string): Promise<GhResult<true>>;
  /** Resolve or unresolve a review thread (HIVE-207), behind the same proof. */
  threadResolved(repo: RepoRef, n: number, threadId: string, resolved: boolean): Promise<GhResult<true>>;
  /** Mark or unmark a file viewed (HIVE-207): the PR's id is read from GitHub first, as {@link GithubClient.comment} does. */
  fileViewed(repo: RepoRef, n: number, path: string, viewed: boolean): Promise<GhResult<true>>;
}

export function createGithubClient(
  ghPath: string,
  run: RunAsync,
): GithubClient {
  /** `gh` could not be executed at all; see {@link ask}'s first catch. */
  const NOT_RUN: { ok: false; error: GhError } = { ok: false, error: ghError('not-installed', 'Could not run `gh`.') };

  /**
   * One `gh api graphql` call (HIVE-205 factored it out of {@link ask}): the
   * constant document, string variables with `-f` and whole numbers with `-F`.
   * `null` when `gh` could not be executed. The body is parsed, never returned
   * raw: callers read `data` and classify `stderr`, which never escapes.
   */
  const graphql = async (
    query: string,
    strings: Record<string, string>,
    numbers: Record<string, number> = {},
  ): Promise<{ data: unknown; stderr: string; timedOut: boolean } | null> => {
    const args = ['api', 'graphql', '-f', `query=${query}`];

    for (const [key, value] of Object.entries(strings)) {
      // `-F` types the value; `-f` keeps it a string. A search expression is
      // always a string, and `-F` would try to read one that happened to look
      // numeric as a number — or, worse, one beginning with `@` as a filename.
      args.push('-f', `${key}=${value}`);
    }
    for (const [key, value] of Object.entries(numbers)) {
      // GraphQL's `Int!` takes a number, which only `-F` sends. The guard has
      // proved it a positive whole number, so it can name no file.
      args.push('-F', `${key}=${String(value)}`);
    }

    let result;
    try {
      result = await run(ghPath, args);
    } catch {
      return null;
    }

    let body: GraphqlBody | null = null;
    try {
      body = JSON.parse(result.stdout) as GraphqlBody;
    } catch {
      body = null;
    }
    return { data: body?.data, stderr: result.stderr, timedOut: result.timedOut };
  };

  /**
   * The half of a query that has nothing to do with *which* PRs are wanted.
   *
   * Extracted when search landed, because search and sweep differ only in their
   * two search expressions — everything after the call is identical, and it is
   * the part with the subtle rules in it: the payload beating the exit code,
   * the two sentinels, and the refusal to let command output escape. Two copies
   * of that would be two chances to drop one of them.
   */
  const ask = async (
    variables: Record<string, string>,
  ): Promise<GhResult<{ data: unknown; login: string }>> => {
    const answer = await graphql(buildPrQuery(), variables);
    // The binary could not be executed at all. It was on the `PATH` when
    // the call started, so this is a machine changing underneath the app
    // rather than a configuration the user can see and fix.
    if (answer === null) return NOT_RUN;

    const { data } = answer;
    const login = readViewerLogin(data);

    /**
     * Two sentinels, because one of them cannot see the failure that matters.
     *
     * **No `viewer`** means the request did not succeed at all: it is the one
     * part of this query that cannot be `null` for a working token, whatever
     * the exit code said. "Mine" is no longer defined by the login —
     * `author:@me` in the expression is — but `mapping.ts` still checks each
     * node's author against it for the sweep, so an unreadable login must not
     * stand in for a successful read.
     *
     * **No connection at all** is the one `viewer` misses, and it is the more
     * dangerous of the two. `viewer` is a top-level field that resolves
     * independently of the searches, so a response where both connections
     * failed still carries a good login beside `open: null, merged: null`.
     * GraphQL calls that partial success and `gh` reports it in `errors`,
     * which this deliberately does not read (the payload beats the exit code,
     * above) — so without this check the call would answer `ok` with an empty
     * list, and `hydratePrs` would install it as *live and not stale*. The
     * panel would then say "No open pull requests of yours" with total
     * confidence: the precise failure this integration was rewritten to stop,
     * reintroduced one layer up and across every repository at once.
     *
     * An empty connection is not a missing one. A user with no open work gets
     * `{ nodes: [] }`, which passes, and one search surviving while the other
     * fails is the partial-data case `collectPrs` is built to keep.
     */
    if (login === null || !hasAnyConnection(data)) {
      return { ok: false, error: classifyGhFailure(answer.stderr, answer.timedOut) };
    }

    return { ok: true, value: { data, login } };
  };

  /**
   * Nothing to scope the search to is a configuration answer, never a request.
   *
   * This covers two cases that must not be told apart by the caller, because
   * the consequence of getting either wrong is the same. The ordinary one is an
   * empty repository list. The other is a list where nothing survived
   * {@link repoQualifiers} — and *that* one is why the check is on the
   * qualifiers rather than on `repos.length`. A search with no `repo:` scope is
   * a perfectly valid query that answers with pull requests from every
   * repository GitHub can see, so a call that fell through here would not fail:
   * it would quietly fill the panel with work from projects the user never
   * configured.
   */
  const scopeFor = (
    repos: readonly RepoRef[],
  ): { ok: true; scope: string[] } | { ok: false; error: GhResult<never> } => {
    const scope = repoQualifiers(repos);
    if (scope.length > 0) return { ok: true, scope };

    /*
      The two cases share a kind but not a sentence. Telling a user whose
      projects all resolved that none of them is a GitHub repository would
      send them to fix a list that is already correct. The second case is
      close to unreachable — these names come from `gh repo view` and
      GitHub's own are always within the permitted set — but an unreachable
      branch is a poor place to keep a message that is false.
    */
    return {
      ok: false,
      error: {
        ok: false,
        error: ghError(
          'no-repos',
          repos.length === 0
            ? 'No configured project is a GitHub repository.'
            : 'No configured repository has a name GitHub search can be scoped to.',
        ),
      },
    };
  };

  /**
   * Whether `threadId` is a thread on this PR (HIVE-207). The id comes from
   * the renderer; this keeps a write on the PR `scoped()` admitted.
   */
  const threadOnPr = async (repo: RepoRef, n: number, threadId: string): Promise<GhResult<true>> => {
    const found = await graphql(PR_THREAD_OWNER_QUERY, { id: threadId });
    if (found === null) return NOT_RUN;
    const on = readThreadPr(found.data);
    if (on === null) return { ok: false, error: classifyGhFailure(found.stderr, found.timedOut) };
    const same =
      on.number === n &&
      on.owner.toLowerCase() === repo.owner.toLowerCase() &&
      on.name.toLowerCase() === repo.name.toLowerCase();
    return same ? { ok: true, value: true } : { ok: false, error: ghError('unknown', 'That thread is not on this pull request.') };
  };

  /** One mutation whose success is its field in `data`, echoing what was written. */
  const write = async (
    query: string,
    field: string,
    strings: Record<string, string>,
    echoed: (answer: Record<string, unknown>) => boolean,
  ): Promise<GhResult<true>> => {
    const answer = await graphql(query, strings);
    if (answer === null) return NOT_RUN;
    if (!mutated(answer.data, field, echoed)) return { ok: false, error: classifyGhFailure(answer.stderr, answer.timedOut) };
    return { ok: true, value: true };
  };

  return {
    async sweep(repos, now) {
      const scoped = scopeFor(repos);
      if (!scoped.ok) return scoped.error;

      const answer = await ask(buildPrVariables(scoped.scope));
      if (!answer.ok) return answer;

      return {
        ok: true,
        value: collectPrs(answer.value.data, answer.value.login, now),
      };
    },

    async search(term, repos) {
      /*
        An empty term after sanitising is not a search, and it must not be sent.
        `assertText` admits `":"` and `"   "`, both of which `safeSearchTerm`
        reduces to nothing — and an expression with no term is `is:pr is:open
        repo:… sort:…`, which answers with *every* open PR in scope and would be
        presented to the user as search results. The UI never sends one; main
        does not rely on that.
      */
      if (safeSearchTerm(term) === '') return { ok: true, value: [] };

      const scoped = scopeFor(repos);
      if (!scoped.ok) return scoped.error;

      const answer = await ask(buildSearchVariables(term, scoped.scope));
      if (!answer.ok) return answer;

      return { ok: true, value: collectSearchPrs(answer.value.data) };
    },

    async detail(repo, n) {
      const answer = await graphql(PR_DETAIL_QUERY, { owner: repo.owner, name: repo.name }, { number: n });
      if (answer === null) return NOT_RUN;

      const detail = toPrDetail(answer.data, repo.owner, repo.name);
      if (detail === null) return { ok: false, error: classifyGhFailure(answer.stderr, answer.timedOut) };
      return { ok: true, value: detail };
    },

    async timeline(repo, n) {
      const answer = await graphql(PR_TIMELINE_QUERY, { owner: repo.owner, name: repo.name }, { number: n });
      if (answer === null) return NOT_RUN;

      const timeline = toPrTimeline(answer.data);
      if (timeline === null) return { ok: false, error: classifyGhFailure(answer.stderr, answer.timedOut) };
      return { ok: true, value: timeline };
    },

    async comment(repo, n, body) {
      const found = await graphql(PR_ID_QUERY, { owner: repo.owner, name: repo.name }, { number: n });
      if (found === null) return NOT_RUN;

      // The subject is GitHub's own id for this PR, never a value the renderer
      // sent, so a write can only land on the PR the scope check admitted.
      const id = readPrId(found.data);
      if (id === null) return { ok: false, error: classifyGhFailure(found.stderr, found.timedOut) };

      const posted = await graphql(PR_COMMENT_MUTATION, { subjectId: id, body });
      if (posted === null) return NOT_RUN;
      if (!commentAdded(posted.data)) {
        return { ok: false, error: classifyGhFailure(posted.stderr, posted.timedOut) };
      }
      return { ok: true, value: true };
    },

    async diff(repo, n) {
      let result;
      try {
        // argv, no shell: the repository is the resolver's spelling and the number a guarded whole number.
        result = await run(ghPath, ['pr', 'diff', String(n), '--repo', `${repo.owner}/${repo.name}`, '--color', 'never']);
      } catch {
        return NOT_RUN;
      }
      if (result.code !== 0) return { ok: false, error: classifyGhFailure(result.stderr, result.timedOut) };
      return { ok: true, value: result.stdout };
    },

    async threadReply(repo, n, threadId, body) {
      const on = await threadOnPr(repo, n, threadId);
      if (!on.ok) return on;
      return write(THREAD_REPLY_MUTATION, 'addPullRequestReviewThreadReply', { threadId, body }, (answer) =>
        echoedId(answer, 'comment'),
      );
    },

    async threadResolved(repo, n, threadId, resolved) {
      const on = await threadOnPr(repo, n, threadId);
      if (!on.ok) return on;
      const echoed = (answer: Record<string, unknown>) => echoedResolved(answer, resolved);
      return resolved
        ? write(THREAD_RESOLVE_MUTATION, 'resolveReviewThread', { threadId }, echoed)
        : write(THREAD_UNRESOLVE_MUTATION, 'unresolveReviewThread', { threadId }, echoed);
    },

    async fileViewed(repo, n, path, viewed) {
      const found = await graphql(PR_ID_QUERY, { owner: repo.owner, name: repo.name }, { number: n });
      if (found === null) return NOT_RUN;
      // The PR is GitHub's own id for the scoped PR, never a renderer value.
      const id = readPrId(found.data);
      if (id === null) return { ok: false, error: classifyGhFailure(found.stderr, found.timedOut) };
      const echoed = (answer: Record<string, unknown>) => echoedId(answer, 'pullRequest');
      return viewed
        ? write(FILE_VIEWED_MUTATION, 'markFileAsViewed', { pullRequestId: id, path }, echoed)
        : write(FILE_UNVIEWED_MUTATION, 'unmarkFileAsViewed', { pullRequestId: id, path }, echoed);
    },
  };
}
