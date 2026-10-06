/**
 * The GitHub integration's contract.
 *
 * Separate from `ipc-contract.ts` for the reason `jira-contract.ts` is: the PR
 * poller brings its own vocabulary — states, findings, check rollups — and
 * folding it into the channel registry would make that file about pull requests
 * rather than about IPC. The same rules apply here as there: types and
 * constants only, no runtime imports, no Node APIs, no DOM APIs.
 *
 * ## Why the renderer's `Pr` type is not this type
 *
 * `electron/main/**` may not import `src/**`, so main could not produce a `Pr`
 * even if it wanted to. It is also the wrong shape: `Pr.session` names the
 * session that owns a PR, which is an app concern main knows nothing about. The
 * renderer resolves that from a branch match, in a selector — see
 * `usePrs()`. What crosses IPC is what GitHub said, mapped to named fields.
 */

/**
 * How far a PR has got. Mirrors the renderer's `PrListState` deliberately: the
 * badge rules in `features/shared/pr-presentation.ts` are the reason these four
 * exist, and a fifth here with no badge would render as nothing at all.
 */
export type GhPrState = 'open' | 'approved' | 'draft' | 'merged';

/** What CI is doing. `passing` also covers a repo with no checks at all. */
export type GhPrChecks = 'passing' | 'running' | 'failing';

/**
 * One pull request, as this app is willing to carry it across IPC.
 *
 * Every field is one a surface renders or resolves against. GitHub's PR payload
 * also carries the author's avatar, the body, the diff stats and a merge-state
 * enum; none of it crosses, because `gh.ts`'s rule is that only mapped, named
 * fields do.
 */
export interface PrRecord {
  number: number;
  title: string;
  /** The `https://github.com/...` page. The only URL any surface opens. */
  url: string;
  /** Short repo name — `the-hive`, not `owner/the-hive`. What the card shows. */
  repo: string;
  /** The owner, kept so two repos with one name stay distinguishable. */
  owner: string;
  /** `headRefName`. What a session's branch is matched against. */
  branch: string;
  state: GhPrState;
  /** Unresolved review threads. Bot or human — a finding is a finding. */
  findings: number;
  checks: GhPrChecks;
  /** ISO 8601, straight from GitHub. Used for ordering, never parsed for display. */
  updatedAt: string;
  /** ISO 8601, as `updatedAt`; `null` until the PR merges. The HATCHED time (HIVE-215). */
  mergedAt: string | null;
  /**
   * Whether the token's owner wrote it (HIVE-215). Every sweep record is, by
   * `collectPrs`' author check; a search result is when its author is the
   * payload's `viewer`. Only a PR of yours can ask for you (SUMMONS).
   */
  mine: boolean;
}

/**
 * Why a read produced nothing.
 *
 * The first three are **configuration**, not failure: they are what the panel
 * explains rather than what it apologises for. The renderer keys its
 * `unconfigured` state on exactly those three, so adding a fourth here without
 * deciding which side it falls on would silently make it an error.
 */
export type GhErrorKind =
  /** No `gh` on the `PATH` a session would search. */
  | 'not-installed'
  /** `gh` is there, but no account is logged in. */
  | 'unauthenticated'
  /** No configured project resolves to a GitHub repository. */
  | 'no-repos'
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'unknown';

export interface GhError {
  kind: GhErrorKind;
  /** Safe to show. Never a token, never raw command output. */
  message: string;
}

/**
 * Every GitHub verb answers with this rather than throwing across IPC.
 *
 * `gh.ts`'s rule again: the panel must render either way. A rail that throws
 * because GitHub is unreachable tells the user this app is broken, when the
 * truth is that GitHub is unreachable.
 */
export type GhResult<T> = { ok: true; value: T } | { ok: false; error: GhError };

/** What `github:prs` answers with. */
export interface PrsSnapshot {
  prs: PrRecord[];
  /** How many repositories were swept. Lets the panel say "0 repos" honestly. */
  repos: number;
}

/**
 * How long a merged PR stays on the panel.
 *
 * Twenty-four hours, and the number is a product decision rather than a
 * technical one: a merged row is there to confirm something landed, which is
 * only news for about a day. Without a window the panel would accumulate every
 * PR the account ever merged.
 */
export const GH_MERGED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How many PRs are read per state, per sweep.
 *
 * **Per sweep, not per repository** — the search connections these size span
 * every configured project at once, where the aliased `repository` blocks they
 * replaced each had a page of their own. Both are first-page reads ordered by
 * `sort:updated-desc`, with no paging.
 *
 * A hundred each is search's own maximum, and the cap is deliberately generous
 * rather than tight: the page is the *only* thing that can now drop a pull
 * request the user still cares about. A PR opened on a Friday and left untouched
 * sinks down an `updated-desc` list every time somebody else's moves, so the
 * headroom is what stops a quiet PR falling off while it waits. Reaching a
 * hundred means a hundred open pull requests of the user's own across every
 * project they have configured, which is a different problem than a panel solves.
 *
 * The cost is affordable at the poll rate: a hundred nodes each carrying
 * `reviewThreads(first: 100)` measures at two rate-limit points, so a sweep of
 * both connections is about four against an hourly budget of five thousand.
 */
export const GH_OPEN_PAGE = 100;
export const GH_MERGED_PAGE = 100;

/**
 * How many review threads are counted per PR.
 *
 * A cap rather than paging, for the same reason: the badge says "12 open
 * findings" the same way whether the true number is 12 or 112, and a second
 * round trip per PR to make an already-alarming number more precise is a poor
 * trade against a poll that runs every minute.
 */
export const GH_THREAD_PAGE = 100;

/**
 * The receiver route one PR record is served on (HIVE-173).
 *
 * The shipper's merge gate needs a contemporaneous unresolved-thread count and
 * may hold no `gh api` (a REST or GraphQL merge hides behind that glob; see
 * HIVE-168). The Hive's own sweep already counts threads for the PR badge, so
 * the record is served to the agent instead.
 */
export const PR_PATH = '/pr';

/** The body cap on {@link PR_PATH}: an `owner/name` and a number, with room. */
export const PR_LOOKUP_MAX_BYTES = 512;

export interface PrLookup {
  /** `owner/name`, as GitHub spells it. */
  repo: string;
  number: number;
}

/**
 * What {@link PR_PATH} answers. `pr` is `null` with a `reason` when the sweep
 * has no such record, which is a real answer and not an error: the sweep lists
 * PRs the user authored, open or merged in the last day, on configured
 * projects only.
 */
export interface PrLookupReply {
  pr: PrRecord | null;
  reason?: string;
}

/** How many comments, reviews, threads, requests and checks one PR page reads (HIVE-205). */
export const GH_DETAIL_PAGE = 100;

/** One PR by repository and number, as the renderer names it (HIVE-205). Main maps it to a configured repo or refuses. */
export interface PrRef {
  owner: string;
  repo: string;
  n: number;
}

/** A comment to post on {@link PrRef}'s PR (HIVE-205). */
export interface PrCommentRequest extends PrRef {
  body: string;
}

/** `github:pr-thread` (HIVE-207): a reply, a resolve or an unresolve on one review thread. */
export type PrThreadRequest = PrRef & { threadId: string } & (
    | { op: 'reply'; body: string }
    | { op: 'resolve' | 'unresolve' }
  );

/** `github:pr-viewed` (HIVE-207): mark or unmark one path viewed. */
export interface PrViewedRequest extends PrRef {
  path: string;
  viewed: boolean;
}

/** A PR-level comment. `author` is `null` for a deleted ("ghost") account. */
export interface PrComment {
  author: string | null;
  body: string;
  createdAt: string;
  url: string;
}

/** A submitted review; `state` is GitHub's (`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`). */
export interface PrReview {
  author: string | null;
  state: string;
  body: string;
  submittedAt: string | null;
  url: string;
}

export type PrThreadComment = PrComment & { diffHunk: string };

/** A review thread; `line` is `null` once outdated, `originalLine` is where it was left. */
export interface PrThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  originalLine: number | null;
  diffSide: string | null;
  comments: PrThreadComment[];
}

/** GitHub's `viewerViewedState`; `dismissed` is "pushed to since you viewed it" (HIVE-207). */
export type PrFileViewed = 'viewed' | 'unviewed' | 'dismissed';

/** One changed file (HIVE-207). `changeType` is GitHub's PatchStatus, lowercased. */
export interface PrFile {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
  viewed: PrFileViewed;
}

export type PrCheckStatus = 'success' | 'failure' | 'running' | 'queued' | 'neutral';

/** A check run or a commit status on the head commit, read as one shape. */
export interface PrCheck {
  name: string;
  status: PrCheckStatus;
  startedAt: string | null;
  completedAt: string | null;
  url: string | null;
  /** The check suite's app slug (`github-actions`, `netlify`, …); null for a commit status (HIVE-206). */
  app: string | null;
  /** The Actions job id (the CheckRun's `databaseId`) when `app` is `github-actions`, else null (HIVE-206). */
  jobId: number | null;
}

/** One PR, read for its page (HIVE-205). `owner`/`repo` are the configured repository's spelling. */
export interface PrDetail {
  id: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  isDraft: boolean;
  body: string;
  createdAt: string;
  mergedAt: string | null;
  baseRef: string | null;
  headRef: string | null;
  headSha: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: string | null;
  reviewDecision: string | null;
  mergeStateStatus: string | null;
  comments: PrComment[];
  reviews: PrReview[];
  /** A requested user's login or team's name. */
  reviewRequests: string[];
  threads: PrThread[];
  checks: PrCheck[];
  /** At most GH_DETAIL_PAGE; `changedFiles` is the true total (HIVE-207). */
  files: PrFile[];
}

/** One CI run on the Timeline, from a commit's check suite (HIVE-208). */
export interface PrTimelineRun {
  /** The workflow run's database id. */
  id: number;
  number: number;
  url: string;
  /** The commit the suite ran on. */
  sha: string;
  workflow: string;
  startedAt: string;
  /** `null` while it runs. */
  endedAt: string | null;
  state: 'passed' | 'failed' | 'running' | 'other';
  /** The names of its failed check runs (jobs), at most ten. */
  failedJobs: string[];
}

/** A PR's history for the Timeline tab (HIVE-208). Newest hundred timeline items. */
export interface PrTimeline {
  createdAt: string;
  mergedAt: string | null;
  isDraft: boolean;
  commits: { oid: string; at: string; url: string }[];
  runs: PrTimelineRun[];
  reviews: { at: string; author: string | null; state: string; url: string }[];
  comments: { at: string; author: string | null; url: string }[];
  events: { kind: 'ready' | 'draft' | 'review-requested' | 'merged'; at: string; actor: string | null }[];
}

/** `github:pr-runs` (HIVE-206): the runs of one PR's head branch. */
export interface PrRunsRequest { owner: string; repo: string; branch: string }
/** A run or a job, by id, in a configured repository (HIVE-206). */
export interface RunRef { owner: string; repo: string; id: number }

/** One workflow run, as `gh run list` names it. Status and conclusion are gh's lowercase words. */
export interface WorkflowRun {
  id: number; number: number; attempt: number;
  status: string; conclusion: string | null;
  headSha: string; event: string; workflowName: string;
  createdAt: string; updatedAt: string; url: string;
}
/** A job as a workflow file declares it: its id, its `name:` and its `needs`. */
export interface WorkflowJobDef { id: string; name: string | null; needs: string[] }
/** One `.github/workflows/*.yml`: its file name, top-level `name:`, and jobs in file order. */
export interface WorkflowDef { file: string; name: string | null; jobs: WorkflowJobDef[] }
/** Runs newest first (at most 40) and the checkout's workflow files. */
export interface PrRuns { runs: WorkflowRun[]; workflows: WorkflowDef[] }

export interface RunStep {
  number: number; name: string; status: string; conclusion: string | null;
  startedAt: string | null; completedAt: string | null;
}
export interface RunJob {
  id: number; runId: number; name: string; status: string; conclusion: string | null;
  startedAt: string | null; completedAt: string | null; url: string; steps: RunStep[];
}
/** A failed job's log, cut to the failure in main (HIVE-206). `truncated`: lines were dropped. */
export interface JobLog { lines: string[]; truncated: boolean }
