import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent } from '@/types/entity';
import { ComingUp } from '@features/home/components/coming-up';
import { useHiveStore } from '@stores/hive-store';

describe('ComingUp', () => {
  beforeEach(() => useHiveStore.getState().reset());

  it('lists a scheduled wake with its time, and a held pickup with none', () => {
    const at = new Date(2026, 9, 3, 16, 0).getTime();
    const patrol = {
      kind: 'agent',
      id: 'pr-patrol',
      icon: 'Robot',
      sub: 'sweeps PRs',
      task: '',
      status: 'sleeping',
      wake: { on: [] },
      mcp: [],
      nextRunAt: at,
    } as unknown as Agent;
    useHiveStore.setState({
      entities: { 'pr-patrol': patrol },
      agentOrder: ['pr-patrol'],
      ledger: [
        { id: 'h1', ts: 1, from: 's', to: 'builder', kind: 'ask', body: 'x', meta: { after: 'acme/incorp#589', ticket: 'HIVE-214' } },
      ],
    });
    render(<ComingUp />);
    expect(screen.getByText('pr-patrol').closest('div')).toHaveTextContent('16:00');
    expect(screen.getByText('picks up HIVE-214 when incorp#589 ships')).toBeInTheDocument();
  });

  it('is not drawn with nothing scheduled or held', () => {
    const { container } = render(<ComingUp />);
    expect(container).toBeEmptyDOMElement();
  });
});
