import type { LedgerEntry } from '@shared/ledger-contract';
import type { PlanBuild, PlanTask, PlanTaskStatus, SessionPlan } from '@shared/plan-contract';

import { keepTicks, type Plans } from './store';
import { isAllDone, stamped } from './task-tools';

/** A build ask, tied to the session that asked it and the plan file it names. */
interface Link {
  entityId: string;
  /** The party the ask went to: the only one whose posts tick it. */
  builder: string | undefined;
  /** The plan file's realpath, one the session itself read (HIVE-359). */
  file: string;
  /** Task ids this build ticked: the ones its answer completes. */
  ticked: Set<string>;
  /** This build's own task states, kept whether or not its plan is on screen (HIVE-359). */
  tasks: PlanTask[];
  state: PlanBuild['state'];
  /** The builder's first post or the answer: when the panel moved to this plan. */
  startedAt?: number;
  /** The answer. */
  endedAt?: number;
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
 * file the session itself read, from the text main read then.
 *
 * - **Link.** A `build` ask naming `meta.plan` (or, with no `meta.stage`, a
 *   body `plan:` line) from a known session links to any plan file that
 *   session read, not only its current one (HIVE-359). Linking moves nothing:
 *   a held ask may wait days.
 * - **Start.** The builder's first `build` post in the thread, or the answer
 *   when there was none, puts the plan on screen with `build: building`. The
 *   session's last started build is the one shown.
 * - **Ticks.** A `build` post from the builder in the ask's thread, with an
 *   integer `meta.task`: `state: 'started'` is in progress, otherwise done.
 *   Each is stamped from `now`, so the panel shows how long a task took. A
 *   build keeps its own ticks whether its plan is on screen or not.
 * - **End.** An answer in the thread: `failed:` or `blocked:` marks the build
 *   and keeps the ticks; anything else completes the tasks this build ticked,
 *   or every task when it ticked none, and marks it `done`. A plan split
 *   across PRs keeps the later PR's tasks pending (sess-a7: PR1's answer
 *   showed PR2's 15–21 done). An ended build takes no more posts.
 *
 * A plan that has since been replaced — another source, another file, another
 * build — is never edited on this build's word.
 *
 * - **Replay.** The links live in memory, so after a relaunch a restored
 *   session's re-read plan has the day's entries folded through the same path,
 *   in order, limited to the threads that session asked. Each tick is stamped
 *   with when it was posted. Nothing new is persisted: the ledger is the record.
 */
/** What `ipc/index.ts` feeds every ledger entry to (HIVE-180). */
export interface BuilderProgress {
  onEntry(entry: LedgerEntry): void;
  /** Fold `entries` onto `entityId`'s plan once its restore re-read is done. */
  replay(entityId: string, entries: readonly LedgerEntry[]): void;
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
  /** Each session's build last started: the one on screen (HIVE-359). */
  const shown = new Map<string, string>();

  /** The link's plan as the panel should draw it: the session's last read of the file, with this build's ticks. */
  const compose = (askId: string, link: Link): SessionPlan | undefined => {
    const base = plans.planOf(link.entityId, link.file);
    if (base === undefined) return undefined;
    const tasks = keepTicks(base.tasks, link.tasks);
    const build: PlanBuild = { askId, state: link.state, ...(link.startedAt === undefined ? {} : { startedAt: link.startedAt }) };
    return { ...base, tasks, allDone: isAllDone(tasks), build };
  };

  /** Offer the link's plan, but only while it is the session's build on screen and the panel still holds it. */
  const refresh = (askId: string, link: Link): void => {
    if (shown.get(link.entityId) !== askId) return;
    const plan = plans.get(link.entityId);
    if (plan?.source !== 'plan-file' || plan.file !== link.file || plan.build?.askId !== askId) return;
    const next = compose(askId, link);
    if (next !== undefined) plans.offer(link.entityId, 'plan-file', next);
  };

  /** The builder started: this plan goes on screen, over any other build of the session (HIVE-359). */
  const start = (askId: string, link: Link, at: number): void => {
    if (link.startedAt !== undefined) return;
    link.startedAt = at;
    link.tasks = plans.planOf(link.entityId, link.file)?.tasks ?? [];
    shown.set(link.entityId, askId);
    const next = compose(askId, link);
    if (next !== undefined) plans.offer(link.entityId, 'plan-file', next);
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
    /*
      Any plan file the session itself read (HIVE-359), not only its current
      one: a split's plans are all written before the first ask. The latest
      read wins a tie. Linking moves nothing; a held ask may wait days.
    */
    const suffix = `/${planPath.replace(/^\.?\//, '')}`;
    const file = plans.files(entry.from).findLast((read) => read.file.endsWith(suffix))?.file;
    if (file === undefined) return;
    links.set(entry.id, { entityId: entry.from, builder: entry.to, file, ticked: new Set(), tasks: [], state: 'building' });
  }

  /** One path for live and replayed entries; `at` stamps the ticks. */
  function handle(entry: LedgerEntry, at: number): void {
    const meta = entry.meta ?? {};
    if (entry.kind === 'ask') {
      link(entry, meta);
      return;
    }
    const askId = entry.thread;
    const linked = askId === undefined ? undefined : links.get(askId);
    if (askId === undefined || linked === undefined) return;
    // An ended build takes nothing more; it is kept so replay knows when it ended.
    if (linked.state !== 'building') return;

    if (entry.kind === 'post') {
      const task = meta.task;
      if (entry.from !== linked.builder || meta.stage !== 'build' || !Number.isInteger(task)) return;
      start(askId, linked, at);
      const id = String(task);
      if (!linked.tasks.some((t) => t.id === id)) return;
      const status: PlanTaskStatus = meta.state === 'started' ? 'in_progress' : 'completed';
      linked.ticked.add(id);
      linked.tasks = linked.tasks.map((t) => (t.id === id ? stamped(t, status, at) : t));
      refresh(askId, linked);
      return;
    }

    if (entry.kind === 'answer') {
      // A builder that ends before its first post still ends on screen.
      start(askId, linked, at);
      const ended = /^(failed|blocked):/i.exec(entry.body.trimStart());
      if (ended === null) {
        const all = linked.ticked.size === 0;
        linked.tasks = linked.tasks.map((t) => (all || linked.ticked.has(t.id) ? stamped(t, 'completed', at) : t));
      }
      linked.state = ended === null ? 'done' : ended[1]?.toLowerCase() === 'blocked' ? 'blocked' : 'failed';
      linked.endedAt = at;
      refresh(askId, linked);
    }
  }

  return {
    onEntry: (entry) => handle(entry, now()),
    replay(entityId, entries) {
      /*
        Only the session's own threads: another session's links are live, and
        folding their ticks through again would restamp them, or put a task
        back to started after it was done.
      */
      const asked = new Set<string>();
      for (const entry of entries) {
        if (entry.kind === 'ask' && entry.from === entityId) asked.add(entry.id);
        if (asked.has(entry.kind === 'ask' ? entry.id : (entry.thread ?? ''))) handle(entry, entry.ts);
      }
    },
  };
}
