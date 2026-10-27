import { CH } from '@shared/ipc-contract';
import type { PlanChangedEvent, PlanFileRead, PlanSource, PlanTask, PlanUpdate, SessionPlan } from '@shared/plan-contract';

import { parsePlanFile, parsePlanPart } from './parse-plan-file';
import { readPlanFile } from './read-plan-file';
import { isAllDone, reduceTaskOp } from './task-tools';

/** Every session's plan, owned by main (HIVE-179). */
export interface Plans {
  /**
   * A main-agent plan op (the adapter already filtered).
   * A plan-file write returns the read's promise, which never rejects.
   */
  apply(update: PlanUpdate): Promise<void> | void;
  /** Offer a whole plan from `source`; accepted by the rank rule. */
  offer(entityId: string, source: PlanSource, next: SessionPlan | undefined): void;
  /** Current plan, or undefined. */
  get(entityId: string): SessionPlan | undefined;
  /** Forget the session's plan and publish `plan: null`, if it had one. */
  drop(entityId: string): void;
  /** Session ended: the plan and the plan file it was read from (HIVE-201). */
  forget(entityId: string): void;
  /**
   * A resumed session's plan, re-read from the file its history kept. The
   * path is main's own record, never the ledger's; the read is confined to
   * `cwd` exactly as a hook-driven one is. Never rejects.
   */
  restore(entityId: string, file: string, cwd: string | undefined): Promise<void>;
  list(): SessionPlan[];
  /** Every plan file the session read, in read order (HIVE-359). Main's own record, never the ledger's. */
  files(entityId: string): PlanFileRead[];
  /** A plan file the session read, as a plan, from the text main last read. Never reads the disk. */
  planOf(entityId: string, file: string): SessionPlan | undefined;
}

/** Lower wins. A source is accepted over a live plan of the same or a higher number. */
export const PLAN_SOURCE_RANK: Readonly<Record<PlanSource, number>> = {
  'task-tools': 1,
  'plan-file': 2,
  'plan-mode': 3,
};

const PROGRESS = { pending: 0, in_progress: 1, completed: 2 } as const;

/**
 * A re-read of a file under a build keeps each task's further status, and its
 * times. The builder ticks over the ledger and its own worktree copy, never the
 * session's file, so the checkboxes there stay empty: taken as they are, one
 * edit to the plan wiped every tick (sess-a7, 14 of 22 shown as 0).
 */
export const keepTicks = (tasks: PlanTask[], previous: readonly PlanTask[]): PlanTask[] =>
  tasks.map((task) => {
    const before = previous.find((t) => t.id === task.id);
    if (before === undefined || PROGRESS[before.status] < PROGRESS[task.status]) return task;
    const { status, startedAt, endedAt } = before;
    return {
      ...task,
      status,
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(endedAt === undefined ? {} : { endedAt }),
    };
  });

/**
 * The plans store: one plan per session, and the rank rule between sources.
 *
 * Every accepted change publishes the full plan on `CH.planChanged`. A plan
 * that becomes all done stays, `N/N`, until the session ends (`forget`) or a
 * new plan replaces it (HIVE-229).
 */
export function createPlans({
  send,
  now = Date.now,
  onPlanFile,
}: {
  send: (channel: string, payload: unknown) => void;
  /** Stamps task times and the plan file's read (HIVE-201). */
  now?: () => number;
  /** A session read a plan file it had not read last: its realpath, for the session history. */
  onPlanFile?: (entityId: string, file: string) => void;
}): Plans {
  const plans = new Map<string, SessionPlan>();
  /** Plan-file paths already refused once, so a refused file warns once, not per edit. */
  const refused = new Set<string>();
  /**
   * Every plan file each session read (HIVE-359), in read order: a read moves
   * its file to the end, so the last entry is the last file read. `text` is
   * set only once the panel took that text.
   */
  const planFiles = new Map<string, Map<string, { at: number; read: string; text?: string }>>();
  const lastRead = (entityId: string): PlanFileRead | undefined => {
    const last = [...(planFiles.get(entityId) ?? [])].at(-1);
    return last === undefined ? undefined : { file: last[0], at: last[1].at };
  };
  const filesOf = (entityId: string): PlanFileRead[] =>
    [...(planFiles.get(entityId) ?? [])].map(([file, { at }]) => ({ file, at }));
  /** A plan-file plan from `text`, with its part when the header names one. */
  const filePlan = (entityId: string, file: string, at: number, text: string, tasks = parsePlanFile(text)): SessionPlan => {
    const part = parsePlanPart(text);
    return { entityId, source: 'plan-file', tasks, allDone: isAllDone(tasks), file, fileAt: at, ...(part === undefined ? {} : { part }) };
  };

  const publish = (entityId: string, plan: SessionPlan | null): void => {
    send(CH.planChanged, { entityId, plan } satisfies PlanChangedEvent);
  };

  function drop(entityId: string): void {
    if (plans.delete(entityId)) publish(entityId, null);
  }

  function set(entityId: string, proposed: SessionPlan | undefined): void {
    if (proposed === plans.get(entityId)) return;
    if (proposed === undefined || proposed.tasks.length === 0) {
      drop(entityId);
      return;
    }
    let next = proposed;
    // A plan from another source still names the session's plan file (HIVE-201).
    const record = lastRead(entityId);
    if (record !== undefined && next.file === undefined) {
      next = { ...next, file: record.file, fileAt: record.at };
    }
    plans.set(entityId, next);
    publish(entityId, next);
  }

  const accepts = (current: SessionPlan | undefined, source: PlanSource): boolean =>
    current === undefined ||
    current.allDone ||
    PLAN_SOURCE_RANK[source] <= PLAN_SOURCE_RANK[current.source];

  function offer(entityId: string, source: PlanSource, next: SessionPlan | undefined): void {
    if (!accepts(plans.get(entityId), source)) return;
    set(entityId, next);
  }

  /**
   * Source 2 (HIVE-180): re-read the plan file on every write to it. The path
   * came from a hook payload, so `readPlanFile` confines it to the session's
   * cwd. A re-read of the file a builder is working keeps its build link.
   */
  async function readPlan(entityId: string, filePath: string, cwd: string | undefined): Promise<void> {
    const read = await readPlanFile(filePath, cwd);
    if (read === undefined) {
      if (!refused.has(filePath)) {
        refused.add(filePath);
        console.warn(`[hive] plan file not read (outside the session, too large, or missing): ${filePath}`);
      }
      return;
    }
    const records = planFiles.get(entityId) ?? new Map<string, { at: number; read: string; text?: string }>();
    const last = records.get(read.file);
    const shown = plans.get(entityId);
    // Unchanged and on screen, whatever its source: nothing to publish, its
    // time stands, and a newer plan is not displaced by the old file.
    if (shown !== undefined && lastRead(entityId)?.file === read.file && last?.text === read.text) return;
    const tasks = parsePlanFile(read.text);
    if (tasks.length === 0) return;
    // When the text was first read, not when it was last re-read: a turned-away
    // file is re-read at every Stop, and its time must not drift with them.
    const at = last !== undefined && last.read === read.text ? last.at : now();
    const current = plans.get(entityId);
    // The text counts as shown only once the panel takes it: a file turned
    // away by rank must still be offered after the plan ahead of it finishes.
    // A builder is working another plan: this file is held for a later build,
    // not shown over the one in progress (HIVE-359, the 16:55 case).
    const held = current?.source === 'plan-file' && current.build?.state === 'building' && current.file !== read.file;
    records.delete(read.file);
    records.set(read.file, { at, read: read.text, ...(!held && accepts(current, 'plan-file') ? { text: read.text } : {}) });
    planFiles.set(entityId, records);
    if (last === undefined) onPlanFile?.(entityId, read.file);
    if (held) return;
    const build = current?.source === 'plan-file' && current.file === read.file ? current.build : undefined;
    const shownTasks = build === undefined ? tasks : keepTicks(tasks, current?.tasks ?? []);
    offer(entityId, 'plan-file', {
      ...filePlan(entityId, read.file, at, read.text, shownTasks),
      ...(build === undefined ? {} : { build }),
    });
  }

  return {
    apply({ entityId, op, cwd }) {
      switch (op.kind) {
        case 'plan-file-touched':
          return readPlan(entityId, op.path, cwd);
        case 'plan-file-reread': {
          /*
            A turn's end re-reads the plan on screen when it is a plan file, else
            the plan file the session last read. A step ticked by a shell edit
            fires no Write or Edit hook, and the panel sat at 0 of 4 on a
            finished plan until one did.
          */
          const shown = plans.get(entityId);
          const file = shown?.source === 'plan-file' ? shown.file : lastRead(entityId)?.file;
          return file === undefined ? undefined : readPlan(entityId, file, cwd);
        }
        case 'plan-proposed':
          // Source 3: plan mode's approved plan, every task proposed.
          if (op.tasks.length > 0) offer(entityId, 'plan-mode', { entityId, source: 'plan-mode', tasks: op.tasks, allDone: false });
          return;
        default:
          // Rank 1 is always accepted, so no `accepts` check here.
          set(entityId, reduceTaskOp(plans.get(entityId), entityId, op, now()));
      }
    },
    offer,
    get: (entityId) => plans.get(entityId),
    drop,
    forget(entityId) {
      planFiles.delete(entityId);
      drop(entityId);
    },
    restore: readPlan,
    list: () => [...plans.values()],
    files: filesOf,
    planOf(entityId, file) {
      const record = planFiles.get(entityId)?.get(file);
      if (record === undefined) return undefined;
      const tasks = parsePlanFile(record.read);
      return tasks.length === 0 ? undefined : filePlan(entityId, file, record.at, record.read, tasks);
    },
  };
}
