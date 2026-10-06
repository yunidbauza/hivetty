import {
  GH_MERGED_WINDOW_MS,
  type GhPrChecks,
  type GhPrState,
  type PrCheck,
  type PrCheckStatus,
  type PrComment,
  type PrDetail,
  type PrFile,
  type PrRecord,
  type PrReview,
  type PrThread,
  type PrTimeline,
  type PrTimelineRun,
} from '../../../shared/github-contract';
import { isRecord } from '../../../shared/guards';

/**
 * GitHub's GraphQL JSON to named fields.
 *
 * Pure. No I/O, no imports beyond the contract, and the clock arrives as an
 * argument — which is what lets the module carrying every branch in this
 * integration be tested against recorded payloads instead of against GitHub.
 *
 * ## Why nothing here throws
 *
 * {@link toPrRecord} answers `null` for an entry it cannot read, exactly as
 * `jira/mapping.ts` does: one malformed PR then costs itself and nothing else.
 * A sweep of forty where the ninth has no `headRefName` renders thirty-nine
 * rows rather than an error, and the panel's rule that it must render either
 * way applies *inside* a sweep too.
 *
 * ## What is still filtered here, now that the search filters too
 *
 * "Mine" is asked for in the query — `author:@me`, see `query.ts` — so the
 * author check here is no longer what defines the list. It is kept anyway,
 * because it costs one comparison and it is the thing that would catch a search
 * expression that failed to scope the way it was meant to. Cheap agreement
 * between two independent mechanisms beats trusting either alone.
 *
 * **The twenty-four hour merged window is a different matter: this is the only
 * place it is applied.** It filters on `mergedAt`, which is the question the
 * panel actually asks — "did this land recently" — and deliberately not on the
 * `updated:` qualifier the search could have carried, which answers "was this
 * touched recently" and would drop a PR for being quiet.
 */

/** A plain object, and not an array. `typeof null` is the usual trap. */
/** A non-empty string, or `null`. Whitespace-only counts as absent. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The account the token belongs to, or `null` if the payload did not say. */
export function readViewerLogin(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const viewer = payload.viewer;
  return isRecord(viewer) ? text(viewer.login) : null;
}

/**
 * The check rollup, reduced to the three states a badge exists for.
 *
 * **A missing rollup is `passing`, and that is a deliberate reading rather than
 * a shrug.** `statusCheckRollup` is `null` when the head commit has no checks at
 * all, which is every PR in a repository without CI. `passing` is the state that
 * produces *no badge* (`composeBadges`), so those PRs render clean instead of
 * growing a permanent "checks running" that will never resolve.
 */
export function toChecks(raw: unknown): GhPrChecks {
  if (!isRecord(raw)) return 'passing';

  const commits = isRecord(raw.commits) ? raw.commits.nodes : null;
  const head = Array.isArray(commits) ? commits[0] : null;
  const commit = isRecord(head) ? head.commit : null;
  const rollup = isRecord(commit) ? commit.statusCheckRollup : null;
  const state = isRecord(rollup) ? text(rollup.state) : null;

  if (state === 'FAILURE' || state === 'ERROR') return 'failing';
  if (state === 'PENDING' || state === 'EXPECTED') return 'running';
  return 'passing';
}

/**
 * Unresolved review threads — what the amber badge counts.
 *
 * Outdated threads are **included**. GitHub marks a thread outdated when the
 * code beneath it moves, which is what happens when an agent pushes a fix
 * *without* resolving the conversation — precisely the case the badge exists to
 * catch. Excluding them would make a PR look clean the moment it was touched.
 */
export function countFindings(raw: unknown): number {
  if (!isRecord(raw)) return 0;

  const threads = isRecord(raw.reviewThreads) ? raw.reviewThreads.nodes : null;
  if (!Array.isArray(threads)) return 0;

  return threads.filter(
    (thread) => isRecord(thread) && thread.isResolved !== true,
  ).length;
}

/**
 * How far the PR has got, in the order the four states actually exclude one
 * another.
 *
 * Merged wins over everything — a merged PR that was once a draft is merged.
 * Draft wins over `approved` because a draft cannot be approved into being
 * ready, and showing "approved" on something nobody can merge would be a lie
 * about what is blocking it.
 */
export function toState(raw: unknown): GhPrState {
  if (!isRecord(raw)) return 'open';

  if (text(raw.state) === 'MERGED') return 'merged';
  if (raw.isDraft === true) return 'draft';
  if (text(raw.reviewDecision) === 'APPROVED') return 'approved';
  return 'open';
}

/**
 * The repository a node came from, or `null`.
 *
 * Read off the node rather than passed in. Search returns one flat list spanning
 * every repository in the expression, so there is no longer an index that says
 * which repo a result belongs to — the node has to carry it, and a node that
 * does not is one this app cannot place on a card.
 */
function repoOf(raw: Record<string, unknown>): { name: string; owner: string } | null {
  const repository = raw.repository;
  if (!isRecord(repository)) return null;

  const name = text(repository.name);
  const owner = isRecord(repository.owner) ? text(repository.owner.login) : null;
  if (name === null || owner === null) return null;

  return { name, owner };
}

/**
 * One PR, or `null` if the entry cannot be read.
 *
 * A search over `type: ISSUE` can also answer with issues and with nodes the
 * inline `... on PullRequest` fragment left empty, so "cannot be read" is a
 * routine outcome here rather than a corruption — those arrive as `{}` and leave
 * as `null`, costing themselves and nothing else.
 */
export function toPrRecord(raw: unknown, mine = false): PrRecord | null {
  if (!isRecord(raw)) return null;

  const number = raw.number;
  if (typeof number !== 'number' || !Number.isInteger(number)) return null;

  const title = text(raw.title);
  const url = text(raw.url);
  const branch = text(raw.headRefName);
  const updatedAt = text(raw.updatedAt);
  const repo = repoOf(raw);
  if (
    title === null ||
    url === null ||
    branch === null ||
    updatedAt === null ||
    repo === null
  ) {
    return null;
  }

  return {
    number,
    title,
    url,
    repo: repo.name,
    owner: repo.owner,
    branch,
    state: toState(raw),
    findings: countFindings(raw),
    checks: toChecks(raw),
    updatedAt,
    mergedAt: text(raw.mergedAt),
    mine,
  };
}

/** `mergedAt` as epoch milliseconds, or `null` when absent or unparseable. */
function mergedAtMs(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const stamp = text(raw.mergedAt);
  if (stamp === null) return null;

  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

/** Whether the PR's author is the account this token belongs to. */
function isAuthoredBy(raw: unknown, login: string): boolean {
  if (!isRecord(raw)) return false;
  const author = raw.author;
  return isRecord(author) && text(author.login) === login;
}

/**
 * Whether the payload carries at least one search connection worth reading.
 *
 * The difference between "you have no open pull requests" and "GitHub did not
 * answer", which `viewer` alone cannot tell apart. `viewer` is a top-level field
 * that resolves independently of the two searches, so a response where both
 * connections failed — a search-backend timeout, a secondary rate limit, an
 * expression GitHub would not parse — still carries a perfectly good login next
 * to `open: null, merged: null`. Reading that as a successful empty sweep would
 * install a *live, non-stale* empty list and put "No open pull requests of
 * yours" on the panel with total confidence, which is the exact failure this
 * whole change set out to remove.
 *
 * An empty connection is **not** this: `{ nodes: [] }` is a record and passes.
 * Only a `null` or missing connection counts as no answer, and only when both
 * are — one search surviving is the partial-data case `collectPrs` keeps.
 */
export function hasAnyConnection(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  return isRecord(payload.open) || isRecord(payload.merged);
}

/** The `nodes` of one search connection, or nothing at all. */
function nodesOf(payload: Record<string, unknown>, key: string): unknown[] {
  const connection = payload[key];
  if (!isRecord(connection)) return [];
  return Array.isArray(connection.nodes) ? connection.nodes : [];
}

/**
 * Every PR worth showing, from one sweep's payload.
 *
 * Order is **live work first, then what landed** — each group by `updatedAt`,
 * newest first. Sorting the whole list by time alone would let a PR merged five
 * minutes ago sit above one waiting on the user right now, and the panel's job
 * is to show what still needs them.
 *
 * The sort is applied here rather than trusted from `sort:updated-desc`, because
 * the two searches arrive as separate lists and the panel's order interleaves
 * neither — it stacks them.
 *
 * A connection that came back missing or `null` contributes nothing rather than
 * failing the sweep. GraphQL answers partial data with a `null` field and an
 * error beside it, and losing the connection that did answer because its sibling
 * did not would be the wrong trade.
 */
export function collectPrs(
  payload: unknown,
  login: string,
  now: number,
): PrRecord[] {
  if (!isRecord(payload)) return [];

  const records: PrRecord[] = [];

  for (const node of nodesOf(payload, 'open')) {
    if (!isAuthoredBy(node, login)) continue;
    const record = toPrRecord(node, true);
    if (record !== null) records.push(record);
  }

  for (const node of nodesOf(payload, 'merged')) {
    if (!isAuthoredBy(node, login)) continue;

    const merged = mergedAtMs(node);
    if (merged === null || now - merged > GH_MERGED_WINDOW_MS) continue;

    const record = toPrRecord(node, true);
    if (record !== null) records.push(record);
  }

  return records.sort((left, right) => {
    const landed = Number(left.state === 'merged') - Number(right.state === 'merged');
    if (landed !== 0) return landed;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

/**
 * The same payload, read for a **search** rather than a sweep.
 *
 * Two filters the sweep applies are deliberately absent, and each would be a
 * bug here:
 *
 * - **The author check.** `collectPrs` re-checks every node against the
 *   viewer's login behind `author:@me`, belt and braces on "mine". A search is
 *   explicitly not about mine, so the same check would silently discard every
 *   result the user asked for.
 * - **The twenty-four hour merged window.** That window exists because the
 *   panel is a *standing* list, where a merge from last month is finished
 *   business nobody needs a row for. A search is a question, and "PRs about
 *   carapace" plainly includes the one merged in March. Hiding it would look
 *   like the search was broken.
 *
 * The sort is shared: open above merged, newest first within each. A search
 * result set reads like the list it replaces, so it is ordered like it.
 *
 * `mine` is the viewer's own authorship, read from the same payload's
 * `viewer { login }` (HIVE-215); a payload without one marks nothing mine.
 */
export function collectSearchPrs(payload: unknown): PrRecord[] {
  if (!isRecord(payload)) return [];

  const login = readViewerLogin(payload);
  const records: PrRecord[] = [];

  for (const key of ['open', 'merged'] as const) {
    for (const node of nodesOf(payload, key)) {
      const record = toPrRecord(node, login !== null && isAuthoredBy(node, login));
      if (record !== null) records.push(record);
    }
  }

  return records.sort((left, right) => {
    const landed = Number(left.state === 'merged') - Number(right.state === 'merged');
    if (landed !== 0) return landed;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

/** A whole number, or `null`. */
function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** `author { login }`, or `null` for a ghost. */
function loginOf(value: unknown): string | null {
  return isRecord(value) ? text(value.login) : null;
}

/** A connection's `nodes`, or nothing. */
function nodesIn(value: unknown): unknown[] {
  return isRecord(value) && Array.isArray(value.nodes) ? value.nodes : [];
}

/** Each node through `read`, the unreadable ones dropped. */
function each<T>(value: unknown, read: (raw: unknown) => T | null): T[] {
  return nodesIn(value).map(read).filter((item): item is T => item !== null);
}

function toComment(raw: unknown): PrComment | null {
  if (!isRecord(raw)) return null;
  const createdAt = text(raw.createdAt);
  const url = text(raw.url);
  if (createdAt === null || url === null) return null;
  return { author: loginOf(raw.author), body: typeof raw.body === 'string' ? raw.body : '', createdAt, url };
}

/** A submitted review; a `PENDING` one is the viewer's unsent draft and is left out. */
function toReview(raw: unknown): PrReview | null {
  if (!isRecord(raw)) return null;
  const state = text(raw.state);
  const url = text(raw.url);
  if (state === null || state === 'PENDING' || url === null) return null;
  return {
    author: loginOf(raw.author),
    state,
    body: typeof raw.body === 'string' ? raw.body : '',
    submittedAt: text(raw.submittedAt),
    url,
  };
}

function toThread(raw: unknown): PrThread | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id);
  const path = text(raw.path);
  if (id === null || path === null) return null;
  return {
    id,
    isResolved: raw.isResolved === true,
    isOutdated: raw.isOutdated === true,
    path,
    line: whole(raw.line),
    originalLine: whole(raw.originalLine),
    diffSide: text(raw.diffSide),
    comments: each(raw.comments, (node) => {
      const comment = toComment(node);
      if (comment === null || !isRecord(node)) return null;
      return { ...comment, diffHunk: typeof node.diffHunk === 'string' ? node.diffHunk : '' };
    }),
  };
}

/** One changed file (HIVE-207). `DISMISSED` is GitHub's "pushed to since you viewed it". */
function toFile(raw: unknown): PrFile | null {
  if (!isRecord(raw)) return null;
  const path = text(raw.path);
  if (path === null) return null;
  const state = text(raw.viewerViewedState);
  return {
    path,
    additions: whole(raw.additions) ?? 0,
    deletions: whole(raw.deletions) ?? 0,
    changeType: (text(raw.changeType) ?? 'modified').toLowerCase(),
    viewed: state === 'VIEWED' ? 'viewed' : state === 'DISMISSED' ? 'dismissed' : 'unviewed',
  };
}

/** A check run's status and conclusion, or a commit status's state, as one word. */
function checkStatus(raw: Record<string, unknown>): PrCheckStatus {
  if (raw.__typename === 'StatusContext') {
    const state = text(raw.state);
    if (state === 'SUCCESS') return 'success';
    if (state === 'FAILURE' || state === 'ERROR') return 'failure';
    return 'running';
  }
  const status = text(raw.status);
  if (status === 'IN_PROGRESS') return 'running';
  if (status !== 'COMPLETED') return 'queued';
  const conclusion = text(raw.conclusion);
  if (conclusion === 'SUCCESS') return 'success';
  if (conclusion === 'NEUTRAL' || conclusion === 'SKIPPED' || conclusion === 'STALE') return 'neutral';
  return 'failure';
}

function toCheck(raw: unknown): PrCheck | null {
  if (!isRecord(raw)) return null;
  const status = raw.__typename === 'StatusContext';
  const name = text(status ? raw.context : raw.name);
  if (name === null) return null;
  const suite = !status && isRecord(raw.checkSuite) && isRecord(raw.checkSuite.app) ? raw.checkSuite.app : null;
  const app = suite === null ? null : text(suite.slug);
  const id = raw.databaseId;
  return {
    name,
    status: checkStatus(raw),
    startedAt: text(status ? raw.createdAt : raw.startedAt),
    completedAt: status ? null : text(raw.completedAt),
    url: text(status ? raw.targetUrl : raw.detailsUrl),
    app,
    jobId: app === 'github-actions' && typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null,
  };
}

/** The head commit's rollup contexts, or nothing. */
function contextsOf(raw: Record<string, unknown>): unknown {
  const head = nodesIn(raw.commits)[0];
  const commit = isRecord(head) ? head.commit : null;
  const rollup = isRecord(commit) ? commit.statusCheckRollup : null;
  return isRecord(rollup) ? rollup.contexts : null;
}

function toReviewer(raw: unknown): string | null {
  const reviewer = isRecord(raw) ? raw.requestedReviewer : null;
  return isRecord(reviewer) ? (text(reviewer.login) ?? text(reviewer.name)) : null;
}

/** The pull request under `repository`, or `null`. */
function pullRequestOf(payload: unknown): Record<string, unknown> | null {
  const repository = isRecord(payload) ? payload.repository : null;
  const raw = isRecord(repository) ? repository.pullRequest : null;
  return isRecord(raw) ? raw : null;
}

/**
 * One PR's page from `PR_DETAIL_QUERY`'s data (HIVE-205), or `null` when the
 * PR is missing or lacks a field the page cannot do without. Defensive like
 * {@link toPrRecord}: a malformed comment, review, thread or check costs
 * itself, a missing scalar is `null` (a count `0`), and nothing throws.
 */
export function toPrDetail(payload: unknown, owner: string, repo: string): PrDetail | null {
  const raw = pullRequestOf(payload);
  if (raw === null) return null;

  const id = text(raw.id);
  const number = whole(raw.number);
  const title = text(raw.title);
  const url = text(raw.url);
  const createdAt = text(raw.createdAt);
  if (id === null || number === null || title === null || url === null || createdAt === null) return null;

  const state = text(raw.state);
  return {
    id,
    owner,
    repo,
    number,
    title,
    url,
    state: state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : 'open',
    isDraft: raw.isDraft === true,
    body: typeof raw.body === 'string' ? raw.body : '',
    createdAt,
    mergedAt: text(raw.mergedAt),
    baseRef: text(raw.baseRefName),
    headRef: text(raw.headRefName),
    headSha: text(raw.headRefOid),
    additions: whole(raw.additions) ?? 0,
    deletions: whole(raw.deletions) ?? 0,
    changedFiles: whole(raw.changedFiles) ?? 0,
    author: loginOf(raw.author),
    reviewDecision: text(raw.reviewDecision),
    mergeStateStatus: text(raw.mergeStateStatus),
    comments: each(raw.comments, toComment),
    reviews: each(raw.reviews, toReview),
    reviewRequests: each(raw.reviewRequests, toReviewer),
    threads: each(raw.reviewThreads, toThread),
    checks: each(contextsOf(raw), toCheck),
    files: each(raw.files, toFile),
  };
}

const RUN_STATE = (status: string | null, conclusion: string | null): PrTimelineRun['state'] =>
  status !== 'COMPLETED' ? 'running' : conclusion === 'SUCCESS' ? 'passed' : conclusion === 'FAILURE' || conclusion === 'TIMED_OUT' || conclusion === 'STARTUP_FAILURE' ? 'failed' : 'other';

/** A commit's workflow suites as runs (HIVE-208). A suite with no workflow run is another app's, and is dropped. */
function runsOf(sha: string, suites: unknown): PrTimelineRun[] {
  return nodesIn(suites).flatMap((raw): PrTimelineRun[] => {
    if (!isRecord(raw) || !isRecord(raw.workflowRun)) return [];
    const run = raw.workflowRun;
    const id = whole(run.databaseId);
    const number = whole(run.runNumber);
    const startedAt = text(raw.createdAt);
    if (id === null || number === null || startedAt === null) return [];
    const state = RUN_STATE(text(raw.status), text(raw.conclusion));
    return [{
      id, number, url: text(run.url) ?? '', sha,
      workflow: isRecord(run.workflow) ? (text(run.workflow.name) ?? '') : '',
      startedAt,
      endedAt: state === 'running' ? null : text(raw.updatedAt),
      state,
      failedJobs: nodesIn(raw.checkRuns).flatMap((r) => (isRecord(r) && text(r.name) !== null ? [text(r.name)!] : [])),
    }];
  });
}

const EVENT_KIND: Record<string, PrTimeline['events'][number]['kind']> = {
  ReadyForReviewEvent: 'ready', ConvertToDraftEvent: 'draft', ReviewRequestedEvent: 'review-requested', MergedEvent: 'merged',
};

/**
 * One PR's history from `PR_TIMELINE_QUERY`'s data (HIVE-208), or `null` when
 * the PR or its `createdAt` is missing. An item it cannot read costs itself.
 */
export function toPrTimeline(payload: unknown): PrTimeline | null {
  const raw = pullRequestOf(payload);
  const createdAt = raw === null ? null : text(raw.createdAt);
  if (raw === null || createdAt === null) return null;

  const timeline: PrTimeline = { createdAt, mergedAt: text(raw.mergedAt), isDraft: raw.isDraft === true, commits: [], runs: [], reviews: [], comments: [], events: [] };
  for (const item of nodesIn(raw.timelineItems)) {
    if (!isRecord(item)) continue;
    const type = text(item.__typename) ?? '';
    if (type === 'PullRequestCommit' && isRecord(item.commit)) {
      const oid = text(item.commit.oid);
      const at = text(item.commit.committedDate);
      if (oid === null || at === null) continue;
      timeline.commits.push({ oid, at, url: text(item.url) ?? '' });
      timeline.runs.push(...runsOf(oid, item.commit.checkSuites));
    } else if (type === 'PullRequestReview') {
      const at = text(item.submittedAt);
      const url = text(item.url);
      if (at !== null && url !== null) timeline.reviews.push({ at, author: loginOf(item.author), state: text(item.state) ?? '', url });
    } else if (type === 'IssueComment') {
      const at = text(item.createdAt);
      const url = text(item.url);
      if (at !== null && url !== null) timeline.comments.push({ at, author: loginOf(item.author), url });
    } else if (EVENT_KIND[type] !== undefined) {
      const at = text(item.createdAt);
      if (at !== null) timeline.events.push({ kind: EVENT_KIND[type], at, actor: loginOf(item.actor) });
    }
  }
  return timeline;
}

/** The PR's node id from `PR_ID_QUERY`'s data, or `null`. */
export function readPrId(payload: unknown): string | null {
  const raw = pullRequestOf(payload);
  return raw === null ? null : text(raw.id);
}

/** The PR a review thread is on, from `PR_THREAD_OWNER_QUERY`'s data (HIVE-207), or `null`. */
export function readThreadPr(payload: unknown): { owner: string; name: string; number: number } | null {
  const node = isRecord(payload) ? payload.node : null;
  const pr = isRecord(node) ? node.pullRequest : null;
  const repository = isRecord(pr) ? pr.repository : null;
  if (!isRecord(pr) || !isRecord(repository)) return null;
  const number = whole(pr.number);
  const owner = loginOf(repository.owner);
  const name = text(repository.name);
  return number === null || owner === null || name === null ? null : { owner, name, number };
}

/**
 * Whether a mutation answered with its own field (HIVE-207), and that field
 * echoes what the write was for (`echoed`); an empty `errors` proves nothing.
 */
export function mutated(
  payload: unknown,
  field: string,
  echoed: (answer: Record<string, unknown>) => boolean = () => true,
): boolean {
  if (!isRecord(payload)) return false;
  const answer = payload[field];
  return isRecord(answer) && echoed(answer);
}

/** A mutation's answer echoes `{ [key]: { id } }`: the comment posted, the PR marked (HIVE-207). */
export function echoedId(answer: Record<string, unknown>, key: string): boolean {
  const inner = answer[key];
  return isRecord(inner) && text(inner.id) !== null;
}

/** A resolve or unresolve echoes the thread at the state it was asked for (HIVE-207). */
export function echoedResolved(answer: Record<string, unknown>, resolved: boolean): boolean {
  const thread = answer.thread;
  return isRecord(thread) && thread.isResolved === resolved;
}

/** Whether `PR_COMMENT_MUTATION` answered with the comment added. */
export function commentAdded(payload: unknown): boolean {
  return isRecord(payload) && isRecord(payload.addComment);
}
