import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Session } from '@/types/entity';

import { emptySnapshot } from '@shared/config-contract';
import { HomePage } from '@features/home/components/home-page';
import { resetProjectConfig, setProjectConfigForTest } from '@lib/project-config';
import { useHiveStore } from '@stores/hive-store';
import { notif } from '@tests/support/notifications';
import { testProjectKey } from '@tests/support/project-key';

const sess = (id: string, status: Session['status']): Session => ({
  kind: 'session', id, project: 'p1', branch: `b/${id}`, status, task: id, cost: '$0', lines: [],
});

describe('HomePage', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useHiveStore.setState({ entities: { a: sess('a', 'working'), b: sess('b', 'waiting') }, order: ['a', 'b'], agentOrder: [] });
    setProjectConfigForTest({
      ...emptySnapshot('/tmp/hive/config.json'),
      projects: [
        {
          id: 'p1',
          name: 'p1',
          path: '/repos/p1',
          icon: 'ph-folder',
          origin: 'local',
          status: 'ok',
          key: testProjectKey('p1'),
          isRepo: true,
        },
      ],
    });
  });

  afterEach(() => resetProjectConfig());

  it('is the Home region, headed, with the comb labelled by the headline', () => {
    render(<HomePage />);
    expect(screen.getByRole('region', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toHaveClass('sr-only');
    expect(screen.getByRole('heading', { level: 2, name: 'The hive is humming' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The hive is humming. 1 working · 0 resting · 1 projects · 0 agents' })).toBeInTheDocument();
  });

  it('counts the Summons queue, not the comb', () => {
    // The comb's own count is 1 (session b waiting); the queue holds b's block and an ask from an agent not in the comb.
    useHiveStore.setState({
      notifs: [
        notif({ action: { type: 'session', entityId: 'b' } }),
        notif({ kind: 'agent.ask', subject: 'ghost', action: { type: 'ask', thread: 't1' } }),
      ],
    });
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 2, name: 'The hive is calling · 2 summons' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^The hive is calling · 2 summons\. / })).toBeInTheDocument();
  });

  it('mounts the strip under the comb', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /needs you|while you were away/i, level: 3 })).toBeInTheDocument();
  });

  it('shows neither page while the config is still loading', () => {
    window.hive = {} as typeof window.hive;
    try {
      setProjectConfigForTest(null);
      render(<HomePage />);
      expect(screen.queryByRole('heading', { name: 'An empty hive' })).toBeNull();
      expect(screen.queryByRole('img', { name: /needs you/ })).toBeNull();
    } finally {
      delete (window as { hive?: unknown }).hive;
    }
  });

  it('shows the first-run page instead with no project mapped', () => {
    setProjectConfigForTest({ ...emptySnapshot('/tmp/hive/config.json'), projects: [] });
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toHaveClass('sr-only');
    expect(screen.getByRole('heading', { name: 'An empty hive' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /needs you/ })).toBeNull();
  });
});
