import type { GhResult, JobLog, RunJob, RunStep, WorkflowRun } from '../../../shared/github-contract';

import { classifyGhFailure, ghError } from './classify';
import { cutLog } from './log-cut';
import type { RepoRef } from './query';
import type { RunAsync, RunResult } from './run';

/**
 * `gh run` for the Checks tab (HIVE-206): the branch's runs, a run's jobs, a
 * job's failed log, and re-run failed. The first `gh` calls that are not
 * GraphQL. The same rules apply: argv only, `gh`'s spelling of the repository
 * from the resolver, and no output text in an error.
 */

export const RUN_LIMIT = 40;
const RUN_FIELDS = 'databaseId,number,attempt,status,conclusion,headSha,event,workflowName,createdAt,updatedAt,url';
/** gh's zero time for a step that never ran. */
const NEVER = '0001-01-01T00:00:00Z';

export interface ActionsClient {
  runs(repo: RepoRef, branch: string): Promise<GhResult<WorkflowRun[]>>;
  jobs(repo: RepoRef, runId: number): Promise<GhResult<RunJob[]>>;
  log(repo: RepoRef, jobId: number): Promise<GhResult<JobLog>>;
  rerunFailed(repo: RepoRef, runId: number): Promise<GhResult<true>>;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const opt = (v: unknown): string | null => (typeof v === 'string' && v !== '' && v !== NEVER ? v : null);
const int = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) ? v : 0);
const UNREADABLE = ghError('unknown', 'The GitHub read failed.');

function toRun(raw: unknown): WorkflowRun | null {
  if (!isRec(raw) || int(raw.databaseId) <= 0) return null;
  return {
    id: int(raw.databaseId), number: int(raw.number), attempt: int(raw.attempt),
    status: str(raw.status), conclusion: opt(raw.conclusion),
    headSha: str(raw.headSha), event: str(raw.event), workflowName: str(raw.workflowName),
    createdAt: str(raw.createdAt), updatedAt: str(raw.updatedAt), url: str(raw.url),
  };
}

function toStep(raw: unknown): RunStep | null {
  if (!isRec(raw)) return null;
  return { number: int(raw.number), name: str(raw.name), status: str(raw.status), conclusion: opt(raw.conclusion),
    startedAt: opt(raw.startedAt), completedAt: opt(raw.completedAt) };
}

function toJob(raw: unknown, runId: number): RunJob | null {
  if (!isRec(raw) || int(raw.databaseId) <= 0) return null;
  const steps = Array.isArray(raw.steps) ? raw.steps.map(toStep).filter((s): s is RunStep => s !== null) : [];
  return { id: int(raw.databaseId), runId, name: str(raw.name), status: str(raw.status), conclusion: opt(raw.conclusion),
    startedAt: opt(raw.startedAt), completedAt: opt(raw.completedAt), url: str(raw.url), steps };
}

const parse = (stdout: string): unknown => {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return undefined;
  }
};

export function createActionsClient(gh: string, run: RunAsync): ActionsClient {
  /** Run `gh`; a non-zero exit is classified, a process that never started is `not-installed`. */
  const call = async (args: string[]): Promise<GhResult<RunResult>> => {
    const answer = await run(gh, args).catch(() => null);
    if (answer === null) return { ok: false, error: ghError('not-installed', 'GitHub CLI (`gh`) could not be started.') };
    if (answer.code !== 0) return { ok: false, error: classifyGhFailure(answer.stderr, answer.timedOut) };
    return { ok: true, value: answer };
  };
  const slug = (repo: RepoRef) => `${repo.owner}/${repo.name}`;

  return {
    async runs(repo, branch) {
      const answer = await call(['run', 'list', '--repo', slug(repo), `--branch=${branch}`, '--limit', String(RUN_LIMIT), '--json', RUN_FIELDS]);
      if (!answer.ok) return answer;
      const body = parse(answer.value.stdout);
      if (!Array.isArray(body)) return { ok: false, error: UNREADABLE };
      return { ok: true, value: body.map(toRun).filter((r): r is WorkflowRun => r !== null) };
    },
    async jobs(repo, runId) {
      const answer = await call(['run', 'view', String(runId), '--repo', slug(repo), '--json', 'jobs']);
      if (!answer.ok) return answer;
      const body = parse(answer.value.stdout);
      if (!isRec(body) || !Array.isArray(body.jobs)) return { ok: false, error: UNREADABLE };
      return { ok: true, value: body.jobs.map((j) => toJob(j, runId)).filter((j): j is RunJob => j !== null) };
    },
    async log(repo, jobId) {
      /*
        The REST endpoint, not `gh run view --log-failed`: that refuses every
        log ("still in progress") until the whole run completes, and the
        failed job is the one worth reading while the rest still run. The job
        log is whole, so `cutLog` narrows it to the failed step. The escape
        flag: `gh api` will not print the runner's ANSI colour otherwise, and
        `cutLog` strips it.
      */
      const answer = await call(['api', '--allow-escape-sequences', `repos/${slug(repo)}/actions/jobs/${String(jobId)}/logs`]);
      if (!answer.ok) return answer;
      return { ok: true, value: cutLog(answer.value.stdout) };
    },
    async rerunFailed(repo, runId) {
      const answer = await call(['run', 'rerun', String(runId), '--repo', slug(repo), '--failed']);
      return answer.ok ? { ok: true, value: true } : answer;
    },
  };
}
