import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanRings } from '@features/plan/components/plan-rings';
import type { SessionPlan } from '@shared/plan-contract';

describe('PlanRings (HIVE-201)', () => {
  it('draws done/total and one ring per task; ✓ when all done', () => {
    const plan = {
      entityId: 's',
      source: 'task-tools',
      allDone: false,
      tasks: [
        { id: '1', title: 'A', status: 'completed' },
        { id: '2', title: 'B', status: 'in_progress' },
      ],
    } satisfies SessionPlan;
    const { container, rerender } = render(<PlanRings plan={plan} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(2);
    rerender(<PlanRings plan={{ ...plan, allDone: true }} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
