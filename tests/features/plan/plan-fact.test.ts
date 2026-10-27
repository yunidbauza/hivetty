import { describe, expect, it } from 'vitest';

import { partLabel, planFact } from '@features/plan/plan-fact';
import type { SessionPlan } from '@shared/plan-contract';

const plan = (over: Partial<SessionPlan> = {}): SessionPlan => ({
  entityId: 's',
  source: 'plan-file',
  allDone: false,
  tasks: [
    { id: '1', title: 'A', status: 'completed' },
    { id: '2', title: 'B', status: 'pending' },
  ],
  ...over,
});

describe('plan-fact (HIVE-359)', () => {
  it('names the PR of a split', () => {
    expect(partLabel({ index: 1, of: 2 })).toBe('PR 1 of 2');
  });

  it('is the tab fact and the rings button name', () => {
    expect(planFact(plan())).toBe('Plan, 1 of 2 done');
    expect(planFact(plan({ allDone: true }))).toBe('Plan, all done');
    expect(planFact(plan({ part: { index: 2, of: 2 } }))).toBe('Plan, PR 2 of 2, 1 of 2 done');
    expect(planFact(plan({ part: { index: 2, of: 2 }, allDone: true }))).toBe('Plan, PR 2 of 2, all done');
  });
});
