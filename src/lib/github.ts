import type {
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
} from '@shared/github-contract';

/**
 * The renderer's half of the GitHub bridge.
 *
 * Mirrors `jira.ts` in the two ways that matter. **No bridge returns `null`** —
 * that is the browser demo, not a failure, and story 083's rule is to
 * feature-detect the bridge rather than the user agent. **A rejected channel
 * returns `null` too**, logged once, because a panel that throws when IPC
 * hiccups is worse than one that says it does not know.
 *
 * No module-level cache. The answer is the store's — `hydratePrs` owns it, and
 * a second copy here would be a second source of truth for the same rows.
 */
export const readPullRequests = async (): Promise<GhResult<PrsSnapshot> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prs();
  } catch (cause) {
    console.error('[hive] github.prs failed:', cause);
    return null;
  }
};

/**
 * Search pull requests, whoever wrote them.
 *
 * `projectId` narrows to one mapped project; omitting it means every mapped
 * project. Same two `null` cases as {@link readPullRequests} and for the same
 * reasons — no bridge is the browser demo, and a rejected channel is a hiccup
 * the panel reports as "could not search" rather than throwing over.
 */
export const searchPullRequests = async (
  term: string,
  projectId?: string,
): Promise<GhResult<PrRecord[]> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.searchPrs(term, projectId);
  } catch (cause) {
    console.error('[hive] github.searchPrs failed:', cause);
    return null;
  }
};

/** One PR's page (HIVE-205). Same two `null` cases as {@link readPullRequests}. */
export const readPrDetail = async (request: PrRef): Promise<GhResult<PrDetail> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prDetail(request);
  } catch (cause) {
    console.error('[hive] github.prDetail failed:', cause);
    return null;
  }
};

/** One PR's history for the Timeline tab (HIVE-208). Same two `null` cases as {@link readPullRequests}. */
export const readPrTimeline = async (request: PrRef): Promise<GhResult<PrTimeline> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prTimeline(request);
  } catch (cause) {
    console.error('[hive] github.prTimeline failed:', cause);
    return null;
  }
};

/** Post a PR-level comment (HIVE-205). Same two `null` cases as {@link readPullRequests}. */
export const postPrComment = async (request: PrCommentRequest): Promise<GhResult<true> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prComment(request);
  } catch (cause) {
    console.error('[hive] github.prComment failed:', cause);
    return null;
  }
};

/** The head branch's runs and the workflow graph (HIVE-206). Same two `null` cases as {@link readPullRequests}. */
export const readPrRuns = async (request: PrRunsRequest): Promise<GhResult<PrRuns> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;
  try {
    return await bridge.github.prRuns(request);
  } catch (cause) {
    console.error('[hive] github.prRuns failed:', cause);
    return null;
  }
};

/** One run's jobs and steps (HIVE-206). Same two `null` cases. */
export const readRunJobs = async (request: RunRef): Promise<GhResult<RunJob[]> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;
  try {
    return await bridge.github.runJobs(request);
  } catch (cause) {
    console.error('[hive] github.runJobs failed:', cause);
    return null;
  }
};

/** One job's failed log (HIVE-206). Same two `null` cases. */
export const readJobLog = async (request: RunRef): Promise<GhResult<JobLog> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;
  try {
    return await bridge.github.jobLog(request);
  } catch (cause) {
    console.error('[hive] github.jobLog failed:', cause);
    return null;
  }
};

/** Re-run a run's failed jobs (HIVE-206). Same two `null` cases. */
export const rerunFailedJobs = async (request: RunRef): Promise<GhResult<true> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;
  try {
    return await bridge.github.rerunFailed(request);
  } catch (cause) {
    console.error('[hive] github.rerunFailed failed:', cause);
    return null;
  }
};

/** One PR's unified diff (HIVE-207). Same two `null` cases as {@link readPullRequests}. */
export const readPrDiff = async (request: PrRef): Promise<GhResult<string> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prDiff(request);
  } catch (cause) {
    console.error('[hive] github.prDiff failed:', cause);
    return null;
  }
};

/** Reply to, resolve or unresolve a review thread (HIVE-207). Same two `null` cases. */
export const writePrThread = async (request: PrThreadRequest): Promise<GhResult<true> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prThread(request);
  } catch (cause) {
    console.error('[hive] github.prThread failed:', cause);
    return null;
  }
};

/** Mark or unmark a file viewed on GitHub (HIVE-207). Same two `null` cases. */
export const writePrViewed = async (request: PrViewedRequest): Promise<GhResult<true> | null> => {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.github.prViewed(request);
  } catch (cause) {
    console.error('[hive] github.prViewed failed:', cause);
    return null;
  }
};
