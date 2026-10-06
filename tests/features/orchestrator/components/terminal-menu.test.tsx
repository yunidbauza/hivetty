import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TerminalMenu } from '@features/orchestrator/components/terminal-menu';
import { resetProjectConfig, setProjectConfigForTest } from '@lib/project-config';
import { emptySnapshot, type ProjectConfig } from '@shared/config-contract';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { testProjectKey } from '@tests/support/project-key';

const project = (id: string, overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
  id,
  name: id,
  path: `/repos/${id}`,
  icon: 'ph-folder',
  origin: 'local',
  status: 'ok',
  key: testProjectKey(id),
  isRepo: true,
  ...overrides,
});

const seed = (projects: ProjectConfig[]) =>
  setProjectConfigForTest({ ...emptySnapshot('/home/dev/.hive/config.json'), projects });

const open = () => userEvent.click(screen.getByRole('button', { name: 'Terminal in a project' }));

/**
 * The chevron half of the Overmind's New session button. The button
 * itself is asserted in `overmind-head.test.tsx`; this pins what the menu lists and
 * what picking does.
 */
describe('TerminalMenu', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    resetProjectConfig();
  });

  afterEach(() => {
    resetProjectConfig();
  });

  it('opens a menu headed "New terminal in…" listing every project in config order', async () => {
    seed(['a', 'b', 'c', 'd', 'e'].map((id) => project(id)));
    render(<TerminalMenu />);

    await open();

    expect(screen.getByText('New terminal in…')).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      expect.stringContaining('a'),
      expect.stringContaining('b'),
      expect.stringContaining('c'),
      expect.stringContaining('d'),
      expect.stringContaining('e'),
    ]);
    // Never a hand-off to the picker: choosing a project there spawns a session.
    expect(screen.queryByRole('menuitem', { name: /more projects/i })).toBeNull();
  });

  it('opens a terminal in the picked project', async () => {
    seed([project('nova-web')]);
    render(<TerminalMenu />);
    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: /nova-web/ }));

    const id = useHiveStore.getState().order.at(-1)!;
    expect(useHiveStore.getState().entities[id]).toMatchObject({
      kind: 'terminal',
      project: 'nova-web',
    });
    expect(useUiStore.getState().activeTab).toBe(id);
  });

  it('disables an unmapped project with its reason, and says host for a container project', async () => {
    seed([
      project('missing', { path: null, status: 'missing' }),
      project('boxed', { container: { workspace: '/w', hiveDir: '/h' } }),
    ]);
    render(<TerminalMenu />);
    await open();

    const missing = screen.getByRole('menuitem', { name: /missing/ });
    expect(missing).toHaveAttribute('aria-disabled', 'true');
    // Visible text, not a `title`: a disabled item has pointer-events off, so a tooltip never shows.
    expect(missing).toHaveTextContent('config.json');
    expect(missing).not.toHaveAttribute('title');
    expect(screen.getByRole('menuitem', { name: /boxed · host/ })).not.toHaveTextContent('config.json');
    expect(screen.getByRole('menuitem', { name: /boxed · host/ })).toBeInTheDocument();
  });
});
