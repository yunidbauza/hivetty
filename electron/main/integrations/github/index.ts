import type { ConfigSnapshot } from '../../../shared/config-contract';
import type {
  GhError,
  GhResult,
  JobLog,
  PrCommentRequest,
  PrDetail,
  PrRecord,
  PrRef,
  PrRuns,
  PrRunsRequest,
  PrsSnapshot,
  PrThreadRequest,
  PrTimeline,
  PrViewedRequest,
  RunJob,
  RunRef,
} from '../../../shared/github-contract';
import { probeCommand } from '../../config/probe';

import { createActionsClient } from './actions';
import { ghError } from './classify';
import { createGithubClient, type GithubClient } from './client';
import type { RepoRef } from './query';
import { createRepoResolver, type RepoResolver } from './repos';
import type { RunAsync } from './run';
import { readWorkflows } from './workflows';

/**
 * The verbs main exposes for GitHub.
 *
 * Composition, and nothing else. `repos.ts` turns directories into repository
 * names, `client.ts` owns the call, `mapping.ts` owns the payload, and this file
 * owns two decisions: which of them a verb needs, and what happens when the
 * machine is not set up yet.
 *
 * **Every verb answers; none throws.** `gh.ts`'s rule, and the reason
 * `GhResult` exists: a rail that cannot render because GitHub is unreachable
 * tells the user this app is broken, when the truth is that GitHub is
 * unreachable.
 *
 * ## Why `gh` is re-resolved on every read
 *
 * `probeCommand` searches the `PATH` a *session* would search, which is the
 * config's runtime environment and can be edited in the settings pane while the
 * app runs. Resolving once at startup would keep reporting "not installed"
 * after the user fixed exactly the thing the message told them to fix.
 */

export interface Github {
  /** Every PR worth showing, across the configured project repositories. */
  prs(): Promise<GhResult<PrsSnapshot>>;
  /**
   * The last successful sweep if it started within `maxAgeMs`, else null. It
   * never runs `gh`; a caller that gets null calls `prs()`.
   */
  latestPrs(maxAgeMs: number): PrsSnapshot | null;
  /**
   * Every PR matching `term`, whoever wrote it (the PRs panel's search row).
   *
   * `projectId` narrows the sweep to one mapped project — the session the user
   * is watching — and its absence means every mapped project. That is the
   * checkbox in the panel, and it is the *only* axis the user can widen: with
   * or without it, the search reaches the repositories the config maps and no
   * others. There is no "all of GitHub" here, deliberately; see
   * `buildSearchVariables`.
   *
   * A `projectId` naming no mapped project resolves to an empty repository list
   * and is refused by the client's scope check, which is the honest answer —
   * better than silently widening to everything the user did not ask for.
   */
  searchPrs(term: string, projectId?: string): Promise<GhResult<PrRecord[]>>;
  /**
   * Project id → repository for the configured projects (HIVE-166), through
   * the same resolver and cache the sweep uses. An empty map when `gh` is not
   * installed; the shipper's merge grant reads this and grants nothing for a
   * project it cannot place.
   */
  resolveProjects(): Promise<Map<string, RepoRef>>;
  /**
   * One PR's page (HIVE-205). Refused, before any GraphQL call, when no
   * configured project maps `owner/repo`; what reaches `gh` is the resolver's
   * spelling of the repository, never the renderer's.
   */
  prDetail(request: PrRef): Promise<GhResult<PrDetail>>;
  /** One PR's history for the Timeline tab (HIVE-208), under the same scope check as {@link Github.prDetail}. */
  prTimeline(request: PrRef): Promise<GhResult<PrTimeline>>;
  /** A PR-level comment, under the same scope check as {@link Github.prDetail}. */
  prComment(request: PrCommentRequest): Promise<GhResult<true>>;
  /** One PR's unified diff (HIVE-207), under the same scope check. */
  prDiff(request: PrRef): Promise<GhResult<string>>;
  /** Reply to, resolve or unresolve one review thread (HIVE-207), under the same scope check. */
  prThread(request: PrThreadRequest): Promise<GhResult<true>>;
  /** Mark or unmark one file viewed (HIVE-207), under the same scope check. */
  prViewed(request: PrViewedRequest): Promise<GhResult<true>>;
  /**
   * The head branch's runs and the checkout's workflow graph (HIVE-206).
   * Refused, before any `gh run`, when no configured project maps `owner/repo` (HIVE-206).
   */
  prRuns(request: PrRunsRequest): Promise<GhResult<PrRuns>>;
  /** One run's jobs and steps. Refused, before any `gh run`, when no configured project maps `owner/repo` (HIVE-206). */
  runJobs(request: RunRef): Promise<GhResult<RunJob[]>>;
  /** One job's failed log, cut. Refused, before any `gh run`, when no configured project maps `owner/repo` (HIVE-206). */
  jobLog(request: RunRef): Promise<GhResult<JobLog>>;
  /** Re-run a run's failed jobs. Refused, before any `gh run`, when no configured project maps `owner/repo` (HIVE-206). */
  rerunFailed(request: RunRef): Promise<GhResult<true>>;
}

interface GithubDeps {
  /** The current config. Read per call — projects change while the app runs. */
  config: () => ConfigSnapshot;
  /**
   * The environment a session would spawn with, merged by the caller.
   *
   * Injected rather than read here because `process.env` is not the answer: a
   * user whose `gh` lives somewhere only their shell profile knows about has it
   * in the config's runtime env, and reporting on a `PATH` no session uses
   * would answer a different question than the one asked.
   */
  env: () => NodeJS.ProcessEnv;
  run: RunAsync;
  /** Injected so the merged window is testable without touching the clock. */
  now: () => number;
}

export function createGithub(deps: GithubDeps): Github {
  /**
   * Resolver and client are cached **per resolved `gh` path**.
   *
   * The resolver holds the directory→repository cache, which is the thing worth
   * keeping between polls; rebuilding it every minute would make the memo
   * pointless. Keying on the path means a `gh` that moved gets a fresh pair
   * rather than a cache built by the old one.
   */
  let cachedFor: string | null = null;
  let resolver: RepoResolver | null = null;
  let client: GithubClient | null = null;

  /**
   * The last good sweep, and the one running now.
   *
   * A sweep is one GraphQL call that takes three to four seconds. The PRs panel
   * runs one a minute, and before this an `mcp__hive__pr` lookup ran another of
   * its own for one record, which outran the MCP host's timeout. Now a lookup
   * reads the panel's last sweep when it is recent, and a caller arriving while
   * a sweep is in flight waits on that one instead of starting a second.
   */
  let last: { at: number; value: PrsSnapshot } | null = null;
  let inflight: Promise<GhResult<PrsSnapshot>> | null = null;

  const sweep = async (): Promise<GhResult<PrsSnapshot>> => {
    const at = deps.now();
    const path = deps.env().PATH ?? '';
    const { resolved } = probeCommand('gh', path);

    if (resolved === null) {
      return {
        ok: false,
        error: {
          kind: 'not-installed',
          message: 'GitHub CLI (`gh`) was not found on this machine.',
        },
      };
    }

    if (cachedFor !== resolved || resolver === null || client === null) {
      cachedFor = resolved;
      resolver = createRepoResolver(resolved, deps.run);
      client = createGithubClient(resolved, deps.run);
    }

    const { repos, failure } = await resolver.resolve(deps.config().projects);

    /**
     * A resolution failure outranks the empty list it produced.
     *
     * Without this, a `gh` that is not logged in reports `no-repos` — because
     * `gh repo view` fails for every project, the list comes back empty, and
     * the sweep short-circuits on the count. The user would be told to fix
     * their project list, which was never the problem, while the message that
     * would actually help them (`gh auth login`) sat one layer down. The
     * failure is only preferred when there is genuinely nothing to sweep: a
     * machine where four repositories resolved and a fifth timed out still
     * gets its four.
     */
    if (repos.length === 0 && failure !== null) {
      return { ok: false, error: failure };
    }

    const result = await client.sweep(repos, at);

    if (!result.ok) return result;

    const value = { prs: result.value, repos: repos.length };
    last = { at, value };
    return { ok: true, value };
  };

  /**
   * The configured repository a request names, and the client to ask it with
   * (HIVE-205). Case-insensitive, as GitHub's names are. Nothing mapped is a
   * refusal, never a widening: the renderer names a repository here, and this
   * is what keeps that name to the user's own projects.
   */
  const scoped = async (
    owner: string,
    repo: string,
  ): Promise<{ ok: true; client: GithubClient; ref: RepoRef; gh: string } | { ok: false; error: GhError }> => {
    const { resolved } = probeCommand('gh', deps.env().PATH ?? '');
    if (resolved === null) {
      return { ok: false, error: ghError('not-installed', 'GitHub CLI (`gh`) was not found on this machine.') };
    }

    if (cachedFor !== resolved || resolver === null || client === null) {
      cachedFor = resolved;
      resolver = createRepoResolver(resolved, deps.run);
      client = createGithubClient(resolved, deps.run);
    }

    const { repos, failure } = await resolver.resolve(deps.config().projects);
    const ref = repos.find(
      (candidate) =>
        candidate.owner.toLowerCase() === owner.toLowerCase() &&
        candidate.name.toLowerCase() === repo.toLowerCase(),
    );
    if (ref !== undefined) return { ok: true, client, ref, gh: resolved };

    // Same precedence as `prs()`: `gh auth login` is not reported as `no-repos`.
    if (repos.length === 0 && failure !== null) return { ok: false, error: failure };
    return { ok: false, error: ghError('no-repos', `${owner}/${repo} is not a configured project's repository.`) };
  };

  /**
   * The checkout of the project whose repository is `ref` (HIVE-206), for its
   * workflow files. Through the resolver's cache, so it spawns nothing new.
   */
  const checkoutOf = async (ref: RepoRef): Promise<string | null> => {
    if (resolver === null) return null;
    const projects = deps.config().projects;
    for (const [id, mapped] of await resolver.resolveEach(projects)) {
      if (mapped.owner.toLowerCase() === ref.owner.toLowerCase() && mapped.name.toLowerCase() === ref.name.toLowerCase()) {
        return projects.find((project) => project.id === id)?.path ?? null;
      }
    }
    return null;
  };

  return {
    prs() {
      inflight ??= sweep().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    latestPrs(maxAgeMs) {
      return last !== null && deps.now() - last.at <= maxAgeMs ? last.value : null;
    },

    async resolveProjects() {
      const path = deps.env().PATH ?? '';
      const { resolved } = probeCommand('gh', path);
      if (resolved === null) return new Map<string, RepoRef>();

      if (cachedFor !== resolved || resolver === null || client === null) {
        cachedFor = resolved;
        resolver = createRepoResolver(resolved, deps.run);
        client = createGithubClient(resolved, deps.run);
      }

      return resolver.resolveEach(deps.config().projects);
    },

    async searchPrs(term, projectId) {
      const path = deps.env().PATH ?? '';
      const { resolved } = probeCommand('gh', path);

      if (resolved === null) {
        return {
          ok: false,
          error: {
            kind: 'not-installed',
            message: 'GitHub CLI (`gh`) was not found on this machine.',
          },
        };
      }

      if (cachedFor !== resolved || resolver === null || client === null) {
        cachedFor = resolved;
        resolver = createRepoResolver(resolved, deps.run);
        client = createGithubClient(resolved, deps.run);
      }

      /*
        Narrowed before resolution, not after. Resolving every project to ask
        about one of them would spawn a `gh repo view` per project on the first
        keystroke of a search — and the resolver's cache is per directory, so
        the ones thrown away would not even be reused unless the user later
        widened.
      */
      const projects = deps.config().projects;
      const scoped =
        projectId === undefined
          ? projects
          : projects.filter((project) => project.id === projectId);

      const { repos, failure } = await resolver.resolve(scoped);

      // Same precedence as `prs()`: a resolution failure outranks the empty
      // list it produced, so `gh auth login` is not reported as `no-repos`.
      if (repos.length === 0 && failure !== null) {
        return { ok: false, error: failure };
      }

      return client.search(term, repos);
    },

    async prDetail({ owner, repo, n }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return scope.client.detail(scope.ref, n);
    },

    async prTimeline({ owner, repo, n }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return scope.client.timeline(scope.ref, n);
    },

    async prComment({ owner, repo, n, body }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return scope.client.comment(scope.ref, n, body);
    },

    async prDiff({ owner, repo, n }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return scope.client.diff(scope.ref, n);
    },

    async prThread(request) {
      const scope = await scoped(request.owner, request.repo);
      if (!scope.ok) return scope;
      return request.op === 'reply'
        ? scope.client.threadReply(scope.ref, request.n, request.threadId, request.body)
        : scope.client.threadResolved(scope.ref, request.n, request.threadId, request.op === 'resolve');
    },

    async prViewed({ owner, repo, n, path, viewed }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return scope.client.fileViewed(scope.ref, n, path, viewed);
    },

    async prRuns({ owner, repo, branch }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      const [runs, checkout] = await Promise.all([
        createActionsClient(scope.gh, deps.run).runs(scope.ref, branch),
        checkoutOf(scope.ref),
      ]);
      if (!runs.ok) return runs;
      const workflows = checkout === null ? [] : await readWorkflows(checkout);
      return { ok: true, value: { runs: runs.value, workflows } };
    },

    async runJobs({ owner, repo, id }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return createActionsClient(scope.gh, deps.run).jobs(scope.ref, id);
    },

    async jobLog({ owner, repo, id }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return createActionsClient(scope.gh, deps.run).log(scope.ref, id);
    },

    async rerunFailed({ owner, repo, id }) {
      const scope = await scoped(owner, repo);
      if (!scope.ok) return scope;
      return createActionsClient(scope.gh, deps.run).rerunFailed(scope.ref, id);
    },
  };
}
