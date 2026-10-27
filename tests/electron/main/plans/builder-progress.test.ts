import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPlans, type Plans } from '../../../../electron/main/plans';
import { createBuilderProgress } from '../../../../electron/main/plans/builder-progress';
import type { LedgerEntry } from '../../../../electron/shared/ledger-contract';
import type { SessionPlan } from '../../../../electron/shared/plan-contract';
import { toPlanUpdate, type ClaudePlanCall } from '../../../support/plan-calls';

const onTool = (plans: Plans, call: ClaudePlanCall) => {
  const update = toPlanUpdate(call);
  return update === undefined ? undefined : plans.apply(update);
};

/**
 * A builder's progress, ticked onto the session that asked for the build
 * (HIVE-180). Authorship is the predicate: the ask's `from` is a session id
 * main minted from the caller's header, and only the party the ask went to
 * may tick it.
 */

let seq = 0;
const entry = (fields: Partial<LedgerEntry> & Pick<LedgerEntry, 'kind' | 'from'>): LedgerEntry => {
  seq += 1;
  return { id: `E${String(seq)}`, ts: seq, body: '', ...fields };
};

const FILE = '/repo/.hive/plans/p.md';

const filePlan: SessionPlan = {
  entityId: 'sess-01',
  source: 'plan-file',
  file: FILE,
  allDone: false,
  tasks: ['1', '2', '3'].map((id) => ({ id, title: `Task ${id}`, status: 'pending' as const, steps: [] })),
};

const ask = (over: Partial<LedgerEntry> = {}): LedgerEntry =>
  entry({
    id: 'A1',
    kind: 'ask',
    from: 'sess-01',
    to: 'builder',
    meta: { stage: 'build', plan: '.hive/plans/p.md' },
    ...over,
  });

const post = (task: unknown, extra: Record<string, unknown> = {}, over: Partial<LedgerEntry> = {}): LedgerEntry =>
  entry({ kind: 'post', from: 'builder', thread: 'A1', meta: { stage: 'build', task, ...extra }, ...over });

const answer = (body: string): LedgerEntry => entry({ kind: 'answer', from: 'builder', thread: 'A1', body });

describe('createBuilderProgress', () => {
  let plans: Plans;
  let progress: ReturnType<typeof createBuilderProgress>;

  const statuses = () => plans.get('sess-01')?.tasks.map((task) => task.status);

  beforeEach(() => {
    vi.useFakeTimers();
    plans = createPlans({ send: vi.fn() });
    plans.offer('sess-01', 'plan-file', filePlan);
    progress = createBuilderProgress({ plans, knowsSession: (id) => id.startsWith('sess-') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("links a build ask to the session's plan file", () => {
    progress.onEntry(ask());

    expect(plans.get('sess-01')?.build).toEqual({ askId: 'A1', state: 'building' });
  });

  it('links an ask whose plan path starts with ./', () => {
    progress.onEntry(ask({ meta: { stage: 'build', plan: './.hive/plans/p.md' } }));

    expect(plans.get('sess-01')?.build?.askId).toBe('A1');
  });

  it("links an ask that names its plan only in the body, as work-on's ask text does", () => {
    progress.onEntry(
      ask({ meta: { intent: 'wait for the builder' }, body: 'Build X\nrepo: /repo\nplan: .hive/plans/p.md\nship: yes' }),
    );
    progress.onEntry(post(1));

    expect(plans.get('sess-01')?.build?.askId).toBe('A1');
    expect(statuses()).toEqual(['completed', 'pending', 'pending']);
  });

  it('never links a body plan line on an ask whose meta names another stage', () => {
    progress.onEntry(ask({ meta: { stage: 'intake' }, body: 'plan: .hive/plans/p.md' }));

    expect(plans.get('sess-01')?.build).toBeUndefined();
  });

  it("ticks tasks from the builder's posts: started, then done", () => {
    progress.onEntry(ask());

    progress.onEntry(post(1, { state: 'started' }));
    expect(statuses()).toEqual(['in_progress', 'pending', 'pending']);

    progress.onEntry(post(1));
    progress.onEntry(post(2));
    expect(statuses()).toEqual(['completed', 'completed', 'pending']);
  });

  it('ignores a post in another thread, from another party, or not a build tick', () => {
    progress.onEntry(ask());
    const before = plans.get('sess-01');

    progress.onEntry(post(1, {}, { thread: 'B9' }));
    progress.onEntry(post(1, {}, { thread: undefined }));
    progress.onEntry(post(1, {}, { from: 'sess-02' }));
    progress.onEntry(post(7));
    progress.onEntry(post('2'));
    progress.onEntry(post(1.5));
    progress.onEntry(post(1, { stage: 'ship' }));
    progress.onEntry(post(1, {}, { meta: undefined }));

    expect(plans.get('sess-01')).toBe(before);
  });

  it('links nothing for an ask that is not a build of this plan file', () => {
    progress.onEntry(ask({ meta: { stage: 'build', plan: '.hive/plans/other.md' } }));
    progress.onEntry(ask({ id: 'A2', meta: { stage: 'ship', plan: '.hive/plans/p.md' } }));
    progress.onEntry(ask({ id: 'A3', meta: { stage: 'build' } }));
    progress.onEntry(ask({ id: 'A4', from: 'reviewer' }));

    expect(plans.get('sess-01')?.build).toBeUndefined();
    // And none of them opened a thread a post could tick.
    progress.onEntry(post(1, {}, { thread: 'A2' }));
    expect(statuses()).toEqual(['pending', 'pending', 'pending']);
  });

  it('never links a broadcast ask, so no other party can end its build', () => {
    const before = plans.get('sess-01');

    progress.onEntry(ask({ to: undefined }));
    progress.onEntry(entry({ kind: 'answer', from: 'sess-02', thread: 'A1', body: 'failed: not mine' }));
    progress.onEntry(entry({ kind: 'answer', from: 'sess-02', thread: 'A1', body: 'done' }));

    expect(plans.get('sess-01')).toBe(before);
  });

  it('links nothing when the session has no plan file', () => {
    void onTool(plans, {
      entityId: 'sess-02',
      toolName: 'TaskCreate',
      toolInput: { subject: 'A' },
      toolResponse: { task: { id: '1', subject: 'A' } },
    });

    progress.onEntry(ask({ from: 'sess-02' }));
    progress.onEntry(ask({ id: 'A5', from: 'sess-03' }));

    expect(plans.get('sess-02')?.build).toBeUndefined();
  });

  it('a failed answer keeps the ticks and forgets the link', () => {
    progress.onEntry(ask());
    progress.onEntry(post(1));

    progress.onEntry(answer('failed: lint\nthe last lines'));

    expect(plans.get('sess-01')?.build).toEqual({ askId: 'A1', state: 'failed' });
    expect(statuses()).toEqual(['completed', 'pending', 'pending']);

    progress.onEntry(post(2));
    expect(statuses()).toEqual(['completed', 'pending', 'pending']);
  });

  it('a blocked answer marks the build blocked', () => {
    progress.onEntry(ask());

    progress.onEntry(answer('  blocked: budget, task 2 not committed'));

    expect(plans.get('sess-01')?.build?.state).toBe('blocked');
  });

  it('any other answer completes every task, so the all-done path runs', () => {
    progress.onEntry(ask());

    progress.onEntry(answer('HIVE-180 built: draft PR #9\nhttps://github.com/o/r/pull/9'));

    expect(statuses()).toEqual(['completed', 'completed', 'completed']);
    expect(plans.get('sess-01')?.allDone).toBe(true);
  });

  it('an answer completes only the tasks its build ticked, so a later PR keeps its own', () => {
    progress.onEntry(ask());
    progress.onEntry(post(1, { state: 'started' }));
    progress.onEntry(post(1));
    progress.onEntry(post(2, { state: 'started' }));

    progress.onEntry(answer('PR1 open: https://github.com/o/r/pull/9'));

    expect(statuses()).toEqual(['completed', 'completed', 'pending']);
    expect(plans.get('sess-01')?.allDone).toBe(false);
  });

  it('stamps a tick with the time it started and the time it was committed', () => {
    progress.onEntry(ask());
    vi.setSystemTime(1_000);
    progress.onEntry(post(1, { state: 'started' }));
    vi.setSystemTime(5_000);
    progress.onEntry(post(1));

    const [task] = plans.get('sess-01')?.tasks ?? [];
    expect([task?.startedAt, task?.endedAt]).toEqual([1_000, 5_000]);
  });

  it('an answer in an unlinked thread changes nothing', () => {
    const before = plans.get('sess-01');

    progress.onEntry(answer('done'));

    expect(plans.get('sess-01')).toBe(before);
  });

  it("never ticks a plan that replaced the one the build was linked to", () => {
    progress.onEntry(ask());
    void onTool(plans, {
      entityId: 'sess-01',
      toolName: 'TaskCreate',
      toolInput: { subject: 'Other work' },
      toolResponse: { task: { id: '1', subject: 'Other work' } },
    });
    const replaced = plans.get('sess-01');

    progress.onEntry(post(1));
    progress.onEntry(answer('https://github.com/o/r/pull/9'));

    expect(plans.get('sess-01')).toBe(replaced);
  });

  /**
   * After a relaunch (HIVE-201 follow-up). The links lived in memory, so an ask
   * sent before the restart never linked again and none of its later ticks
   * applied. The ledger is the record: a restored session's plan, once re-read,
   * has the day's entries replayed onto it through the same path live ones take.
   */
  describe('replay', () => {
    const relaunch = () => {
      plans = createPlans({ send: vi.fn() });
      progress = createBuilderProgress({ plans, knowsSession: (id) => id.startsWith('sess-') });
      // The restore re-read of the session's plan file.
      plans.offer('sess-01', 'plan-file', filePlan);
    };

    it('restores the link and the ticks, stamped with when each was posted', () => {
      const log = [
        ask(),
        post(1, { state: 'started' }, { ts: 1_000 }),
        post(1, {}, { ts: 2_000 }),
        post(2, { state: 'started' }, { ts: 3_000 }),
        post(2, {}, { ts: 4_000 }),
        post(3, { state: 'started' }, { ts: 5_000 }),
        post(3, {}, { ts: 6_000 }),
      ];
      relaunch();

      progress.replay('sess-01', log);

      expect(plans.get('sess-01')?.build).toEqual({ askId: 'A1', state: 'building' });
      expect(plans.get('sess-01')?.tasks.map((t) => [t.status, t.startedAt, t.endedAt])).toEqual([
        ['completed', 1_000, 2_000],
        ['completed', 3_000, 4_000],
        ['completed', 5_000, 6_000],
      ]);
    });

    it('lets a tick appended live after the replay land', () => {
      const log = [ask(), post(1)];
      relaunch();
      progress.replay('sess-01', log);

      progress.onEntry(post(2));

      expect(statuses()).toEqual(['completed', 'completed', 'pending']);
    });

    it('changes nothing for an unknown session, a broadcast ask, or another party', () => {
      relaunch();
      const before = plans.get('sess-01');

      // A party main has no session for, holding the same plan file.
      plans.offer('stranger', 'plan-file', { ...filePlan, entityId: 'stranger' });
      const theirs = plans.get('stranger');
      progress.replay('stranger', [ask({ from: 'stranger' }), post(1)]);
      expect(plans.get('stranger')).toBe(theirs);

      progress.replay('sess-01', [
        ask({ id: 'A2', to: undefined }),
        post(1, {}, { thread: 'A2' }),
        ask({ id: 'A3' }),
        post(1, {}, { thread: 'A3', from: 'sess-02' }),
      ]);

      expect(plans.get('sess-01')?.tasks).toEqual(before?.tasks);
      expect(plans.get('sess-01')?.build).toEqual({ askId: 'A3', state: 'building' });
    });

    it("replays only the session's own threads, so another session's live build is not re-ticked", () => {
      plans.offer('sess-02', 'plan-file', { ...filePlan, entityId: 'sess-02' });
      const theirs = ask({ id: 'B1', from: 'sess-02' });
      progress.onEntry(theirs);
      const tick = post(1, {}, { thread: 'B1' });
      progress.onEntry(tick);
      const shown = plans.get('sess-02');

      progress.replay('sess-01', [theirs, tick, post(1, { state: 'started' }, { thread: 'B1' })]);

      expect(plans.get('sess-02')).toBe(shown);
    });

    it('leaves the link forgotten when a replayed answer ended the build', () => {
      const log = [ask(), post(1), answer('PR open: https://github.com/o/r/pull/9')];
      relaunch();
      progress.replay('sess-01', log);
      expect(statuses()).toEqual(['completed', 'pending', 'pending']);

      progress.onEntry(post(2));

      expect(statuses()).toEqual(['completed', 'pending', 'pending']);
    });

    it('never completes a plan the session has since replaced', () => {
      const log = [ask(), post(1), answer('PR open')];
      relaunch();
      plans.offer('sess-01', 'plan-file', { ...filePlan, file: '/repo/.hive/plans/next.md' });
      const replaced = plans.get('sess-01');

      progress.replay('sess-01', log);

      expect(plans.get('sess-01')).toBe(replaced);
    });
  });
});
