import type { LedgerEntry } from '@shared/ledger-contract';
import type { PlanTaskStatus, SessionPlan } from '@shared/plan-contract';

import type { Plans } from './store';
import { isAllDone, stamped } from './task-tools';

/** A build ask, tied to the session that asked it and the plan file it names. */
interface Link {
  entityId: string;
  /** The party the ask went to: the only one whose posts tick it. */
  builder: string | undefined;
  /** The plan file's realpath when the link was made. */
  file: string;
  /** Task ids this build ticked: the ones its answer completes. */
  ticked: Set<string>;
}

/**
 * A builder's progress, ticked onto the session that asked for the build
 * (HIVE-180).
 *
 * The builder's own hooks arrive under its name and never touch a session's
 * plan (HIVE-179); the ledger is the only path. Authorship is the predicate:
 * the link is the ask's `from` — a session id main minted from the caller's
 * header, never body text — and only the party the ask went to may tick it.
 * Main never reads a file on the ledger's word: an ask links only to a plan
 * the session already holds from its own plan file.
 *
 * - **Link.** A `build` ask naming `meta.plan` (or, with no `meta.stage`, a
 *   body `plan:` line) from a known session whose current plan is that plan
 *   file sets `build: building`.
 * - **Ticks.** A `build` post from the builder in the ask's thread, with an
 *   integer `meta.task`: `state: 'started'` is in progress, otherwise done.
 *   Each is stamped from `now`, so the panel shows how long a task took.
 * - **End.** An answer in the thread: `failed:` or `blocked:` marks the build
 *   and keeps the ticks; anything else completes the tasks this build ticked,
 *   or every task when it ticked none. A plan split across PRs keeps the later
 *   PR's tasks pending (sess-a7: PR1's answer showed PR2's 15–21 done). The
 *   link is forgotten either way.
 *
 * A plan that has since been replaced — another source, another file, another
 * build — is never edited on this build's word.
 */
/** What `ipc/index.ts` feeds every ledger entry to (HIVE-180). */
export interface BuilderProgress {
  onEntry(entry: LedgerEntry): void;
}

export function createBuilderProgress({
  plans,
  knowsSession,
  now = Date.now,
}: {
  plans: Plans;
  knowsSession: (id: string) => boolean;
  now?: () => number;
}): BuilderProgress {
  const links = new Map<string, Link>();

  const edit = (askId: string, link: Link, change: (plan: SessionPlan) => SessionPlan): void => {
    const plan = plans.get(link.entityId);
    if (plan?.source !== 'plan-file' || plan.file !== link.file || plan.build?.askId !== askId) return;
    plans.offer(link.entityId, 'plan-file', change(plan));
  };

  function link(entry: LedgerEntry, meta: Record<string, unknown>): void {
    /*
      A session sometimes sends the ask with `plan:` only in its body, meta
      reduced to `intent` (INCORP-620). The body's line counts when meta names
      no stage: the suffix match below still confines it to the session's own
      plan file.
    */
    const bodyPlan = meta.stage === undefined ? /^plan:\s*(\S+)\s*$/m.exec(entry.body)?.[1] : undefined;
    const planPath = meta.plan ?? bodyPlan;
    if ((meta.stage ?? 'build') !== 'build' || typeof planPath !== 'string' || !knowsSession(entry.from)) return;
    /*
      A broadcast ask is never linked: nobody could tick it, and the ledger
      lets any party answer a thread with no `to` — so any session or agent
      could fail or complete a build that is not theirs.
    */
    if (entry.to === undefined) return;
    const plan = plans.get(entry.from);
    const suffix = `/${planPath.replace(/^\.?\//, '')}`;
    if (plan?.source !== 'plan-file' || plan.file === undefined || !plan.file.endsWith(suffix)) return;
    links.set(entry.id, { entityId: entry.from, builder: entry.to, file: plan.file, ticked: new Set() });
    plans.offer(entry.from, 'plan-file', { ...plan, build: { askId: entry.id, state: 'building' } });
  }

  return {
    onEntry(entry) {
      const meta = entry.meta ?? {};
      if (entry.kind === 'ask') {
        link(entry, meta);
        return;
      }
      const askId = entry.thread;
      const linked = askId === undefined ? undefined : links.get(askId);
      if (askId === undefined || linked === undefined) return;

      if (entry.kind === 'post') {
        const task = meta.task;
        if (entry.from !== linked.builder || meta.stage !== 'build' || !Number.isInteger(task)) return;
        const id = String(task);
        const status: PlanTaskStatus = meta.state === 'started' ? 'in_progress' : 'completed';
        linked.ticked.add(id);
        edit(askId, linked, (plan) => {
          if (!plan.tasks.some((t) => t.id === id)) return plan;
          const tasks = plan.tasks.map((t) => (t.id === id ? stamped(t, status, now()) : t));
          return { ...plan, tasks, allDone: isAllDone(tasks) };
        });
        return;
      }

      if (entry.kind === 'answer') {
        const ended = /^(failed|blocked):/i.exec(entry.body.trimStart());
        edit(askId, linked, (plan) => {
          if (ended !== null) {
            const state = ended[1]?.toLowerCase() === 'blocked' ? 'blocked' : 'failed';
            return { ...plan, build: { askId, state } };
          }
          const all = linked.ticked.size === 0;
          const tasks = plan.tasks.map((t) => (all || linked.ticked.has(t.id) ? stamped(t, 'completed', now()) : t));
          return { ...plan, tasks, allDone: isAllDone(tasks) };
        });
        links.delete(askId);
      }
    },
  };
}
