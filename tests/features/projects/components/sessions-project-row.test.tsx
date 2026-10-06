import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProjectRow } from '@/types/entity';

import { SessionsProjectRow } from '@features/projects/components/sessions-project-row';
import { projectConfigSnapshot, resetProjectConfig, setProjectConfigForTest } from '@lib/project-config';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet, seedDemoProjectConfig } from '@tests/support/demo-fleet';
import { testProjectKey } from '@tests/support/project-key';

// nova-web: hero-refresh working, lead-form waiting, e2e-quote idle — 1 needs you, 2 other.
const nova: ProjectRow = {
  id: 'nova-web',
  key: testProjectKey('nova-web'),
  name: 'nova-web',
  icon: 'ph-globe-hemisphere-west',
};
// infra-terraform: ecs-scaling is done — nothing live.
const empty: ProjectRow = {
  id: 'infra-terraform',
  key: testProjectKey('infra-terraform'),
  name: 'infra-terraform',
  icon: 'ph-stack',
};

describe('SessionsProjectRow (HIVE-197)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
    seedDemoProjectConfig();
  });
  afterEach(() => resetProjectConfig());

  it('starts folded, with an amber needs-you badge on the icon', () => {
    render(<SessionsProjectRow project={nova} />);
    expect(screen.getByRole('button', { name: 'Unfold nova-web' })).toHaveAttribute('aria-expanded', 'false');
    // Needs-you wins the badge; the live count waits behind it.
    expect(screen.getByTitle('1 need you')).toHaveClass('bg-amber');
    expect(screen.queryByTitle(/live$/)).toBeNull();
  });

  it('badges a folded project green with its live count when nothing needs you', () => {
    act(() => useHiveStore.getState().appendEntityLines('lead-form', [], 'working'));
    render(<SessionsProjectRow project={nova} />);
    expect(screen.getByTitle('3 live')).toHaveClass('bg-green');
    expect(screen.queryByTitle(/need you$/)).toBeNull();
  });

  it('drops the badge once unfolded, where the sessions speak for themselves', () => {
    useUiStore.getState().expandProject('nova-web');
    render(<SessionsProjectRow project={nova} />);
    expect(screen.queryByTitle(/need you$|live$/)).toBeNull();
  });

  it('clicking the name filters the Overmind and unfolds the project', async () => {
    render(<SessionsProjectRow project={nova} />);
    await userEvent.click(screen.getByRole('button', { name: /^nova-web/ }));
    expect(useUiStore.getState().sessionsProject).toBe('nova-web');
    expect(screen.getByRole('button', { name: /^nova-web/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'New session in nova-web' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminal in nova-web' })).toBeInTheDocument();
  });

  it('carries the new-session and terminal actions on the project line, folded or not', () => {
    render(<SessionsProjectRow project={nova} />);
    const session = screen.getByRole('button', { name: 'New session in nova-web' });
    const terminal = screen.getByRole('button', { name: 'Terminal in nova-web' });
    // Shown on hover or focus, and the counts give way to them.
    expect(session.parentElement).toHaveClass('opacity-0', 'group-hover:opacity-100', 'group-has-[:focus-visible]:opacity-100');
    // Never plain focus-within: a mouse click focuses a button and would pin the actions open.
    expect(session.parentElement).not.toHaveClass('group-focus-within:opacity-100');
    expect(terminal.parentElement).toBe(session.parentElement);
  });

  it('the caret folds without touching the filter', async () => {
    useUiStore.getState().setSessionsProject('nova-web');
    render(<SessionsProjectRow project={nova} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fold nova-web' }));
    expect(useUiStore.getState().expanded['nova-web']).toBe(false);
    expect(useUiStore.getState().sessionsProject).toBe('nova-web');
  });

  it('unfolded rows are one line each', () => {
    useUiStore.getState().expandProject('nova-web');
    render(<SessionsProjectRow project={nova} />);
    expect(screen.getByText('hero-refresh')).toBeInTheDocument();
    expect(screen.queryByText('feat/hero-refresh')).not.toBeInTheDocument();
  });

  it('pills the project key before the name, out of the accessible name', () => {
    render(<SessionsProjectRow project={nova} />);
    const key = screen.getByText(nova.key);
    expect(key.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^nova-web/ })).toContainElement(key);
  });

  it('shows no label and no badge when nothing is live', () => {
    render(<SessionsProjectRow project={empty} />);
    expect(screen.queryByText('no sessions')).toBeNull();
    expect(screen.queryByTitle(/live$/)).toBeNull();
  });
});

describe('SessionsProjectRow, an unmapped project (HIVE-211 sweep, HIVE-197 row)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
    seedDemoProjectConfig();
  });
  afterEach(() => resetProjectConfig());

  it('marks a project the config never mentions, with the reason as its title', () => {
    const ghost: ProjectRow = { id: 'ghost', key: testProjectKey('ghost'), name: 'ghost', icon: 'ph-folder' };
    render(<SessionsProjectRow project={ghost} />);
    const tag = screen.getByText('unmapped');
    expect(tag.getAttribute('title') ?? '').not.toBe('');
    // It gives way to the hover actions.
    expect(tag.parentElement).toHaveClass('group-hover:invisible', 'group-has-[:focus-visible]:invisible');
    expect(tag.parentElement).not.toHaveClass('group-focus-within:invisible');
  });

  it('does not mark a mapped project', () => {
    render(<SessionsProjectRow project={nova} />);
    expect(screen.queryByText('unmapped')).toBeNull();
  });

  it('offers Map it in Settings once the unmapped project is the filter (HIVE-218)', async () => {
    const ghost: ProjectRow = { id: 'ghost', key: testProjectKey('ghost'), name: 'ghost', icon: 'ph-folder' };
    render(<SessionsProjectRow project={ghost} />);
    expect(screen.queryByRole('button', { name: 'Map it in Settings' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^ghost/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Map it in Settings' }));
    expect(useUiStore.getState().settings).toBe(true);
    expect(useUiStore.getState().settingsSection).toBe('projects');
  });

  it('says Fix it in Settings for a project whose path is bad (HIVE-218)', async () => {
    const config = projectConfigSnapshot();
    if (config === null) throw new Error('the demo config was not seeded');
    setProjectConfigForTest({
      ...config,
      projects: config.projects.map((project) =>
        project.id === 'nova-web' ? { ...project, status: 'missing' as const } : project,
      ),
    });
    render(<SessionsProjectRow project={nova} />);
    await userEvent.click(screen.getByRole('button', { name: /^nova-web/ }));
    expect(screen.getByRole('button', { name: 'Fix it in Settings' })).toBeInTheDocument();
  });

  it('offers nothing for a mapped project, even as the filter (HIVE-218)', async () => {
    render(<SessionsProjectRow project={nova} />);
    await userEvent.click(screen.getByRole('button', { name: /^nova-web/ }));
    expect(screen.queryByRole('button', { name: /in Settings$/ })).toBeNull();
  });
});
