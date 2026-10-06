import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionsPanel } from '@features/projects/components/sessions-panel';
import { resetProjectConfig } from '@lib/project-config';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet, seedDemoProjectConfig } from '@tests/support/demo-fleet';

describe('SessionsPanel (HIVE-197)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
    seedDemoProjectConfig();
  });
  afterEach(() => resetProjectConfig());

  it('heads the list with Projects and the live and needs-you words', () => {
    render(<SessionsPanel />);
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ live$/)).toHaveClass('text-green');
    expect(screen.getByText(/\d+ needs you/)).toHaveClass('text-amber-text');
  });

  it('All projects is current with no filter, and clears one', async () => {
    useUiStore.getState().setSessionsProject('nova-web');
    render(<SessionsPanel />);
    const all = screen.getByRole('button', { name: /^All projects/ });
    expect(all).not.toHaveAttribute('aria-current');
    await userEvent.click(all);
    expect(useUiStore.getState().sessionsProject).toBeNull();
    expect(all).toHaveAttribute('aria-current', 'true');
  });

  it('lists every project folded, with nothing at the foot', () => {
    render(<SessionsPanel />);
    const folds = screen.getAllByRole('button', { name: /^Unfold / });
    expect(folds.length).toBe(5);
    const buttons = screen.getAllByRole('button');
    expect(buttons.at(-1)).not.toHaveAccessibleName(/new project/i);
  });

  it('the head’s + is the one way to add a project, not New session', () => {
    render(<SessionsPanel />);
    const heading = screen.getByRole('heading', { name: 'Projects' });
    const add = screen.getByRole('button', { name: 'Add a new project' });
    expect(heading.parentElement).toContainElement(add);
    expect(screen.getAllByRole('button', { name: /new project/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'New session' })).not.toBeInTheDocument();
  });

  it('with no projects, draws the empty state', () => {
    resetProjectConfig();
    render(<SessionsPanel />);
    expect(screen.queryByRole('button', { name: /^All projects/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
    expect(screen.getByText('Settings → Projects')).toBeInTheDocument();
  });
});
