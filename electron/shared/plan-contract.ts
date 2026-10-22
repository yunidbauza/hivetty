/**
 * A session's plan: the task list the plan panel draws (HIVE-178).
 *
 * One plan per session, owned by one source at a time. Types, the plan ops
 * (HIVE-238) and the plan-file path helpers, all import-free, so both
 * processes may import it.
 */
export type PlanTaskStatus = 'pending' | 'in_progress' | 'completed';

/** Rank order: 'task-tools' (1) beats 'plan-file' (2) beats 'plan-mode' (3). */
export type PlanSource = 'task-tools' | 'plan-file' | 'plan-mode';

export interface PlanStep {
  text: string;
  done: boolean;
}

export interface PlanTask {
  /** task-tools: Claude's id; plan-file: the task number; plan-mode: 1-based index. */
  id: string;
  title: string;
  status: PlanTaskStatus;
  /** Present continuous wording Claude shows in its spinner ("Pushing the branch"). task-tools only. */
  activeForm?: string;
  /** Epoch ms the task first went `in_progress` (HIVE-201). Never re-stamped. */
  startedAt?: number;
  /** Epoch ms the task went `completed` (HIVE-201). */
  endedAt?: number;
  /** plan-file only (HIVE-180). */
  steps?: PlanStep[];
}

interface PlanBuild {
  askId: string;
  state: 'building' | 'failed' | 'blocked';
}

export interface SessionPlan {
  entityId: string;
  source: PlanSource;
  tasks: PlanTask[];
  /** No task left unfinished. The plan stays until the session ends or a new plan replaces it (HIVE-229). */
  allDone: boolean;
  /** The session's last plan file, absolute (HIVE-180). Set on a plan-file plan, and carried onto a later plan from any source (HIVE-201). */
  file?: string;
  /** Epoch ms main accepted the read of {@link file} (HIVE-201). */
  fileAt?: number;
  /** A builder is working this plan (HIVE-180). */
  build?: PlanBuild;
}

/** `plan: null` means the session has no plan any more. */
export interface PlanChangedEvent {
  entityId: string;
  plan: SessionPlan | null;
}

export interface PlansSnapshot {
  plans: SessionPlan[];
}

/**
 * A `hive:plan` file: `<anything>/.hive/plans/<name>.md`, one level deep
 * (HIVE-180). A path with an escaped quote never reaches here — the prefix
 * read refuses it — and main confines the read to the session's cwd besides.
 */
export const PLAN_FILE_PATH = /\/\.hive\/plans\/[^/]+\.md$/;

/** Whether a hook payload's `file_path` names a plan file. */
export const isPlanFilePath = (value: unknown): value is string =>
  typeof value === 'string' && PLAN_FILE_PATH.test(value);

/** A harness's plan tool call, normalised by its adapter (HIVE-238). The plans store applies these. */
export type PlanOp =
  | { kind: 'task-created'; id: string; title: string; activeForm?: string }
  | { kind: 'task-updated'; id: string; status?: PlanTaskStatus; title?: string; activeForm?: string }
  | { kind: 'task-deleted'; id: string }
  | { kind: 'tasks-replaced'; tasks: { id: string; title: string; status: PlanTaskStatus; activeForm?: string }[] }
  | { kind: 'plan-proposed'; tasks: PlanTask[] }
  | { kind: 'plan-file-touched'; path: string }
  /** A turn ended: re-read the plan file the session last read. */
  | { kind: 'plan-file-reread' };

/** One main-agent plan op for one session, as the receiver hands it to the plans store (HIVE-238). */
export interface PlanUpdate {
  entityId: string;
  op: PlanOp;
  cwd?: string;
}
