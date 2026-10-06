import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirstRun } from '@features/home/components/first-run';
import { useUiStore } from '@stores/ui-store';

const addProject = vi.fn();
vi.mock('@hooks/use-add-project', () => ({
  useAddProject: () => ({
    addProject,
    choosing: false,
    picking: false,
    cancelPicking: vi.fn(),
    onPicked: vi.fn(),
  }),
}));

describe('FirstRun', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    addProject.mockClear();
  });

  it('says the hive is empty and draws seven cells', () => {
    const { container } = render(<FirstRun />);
    expect(screen.getByRole('heading', { name: 'An empty hive' })).toBeInTheDocument();
    expect(
      screen.getByText('Nothing is running yet. Three steps and the comb fills.'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('polygon')).toHaveLength(7);
  });

  it('step 1 adds a project', () => {
    render(<FirstRun />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a project' }));
    expect(addProject).toHaveBeenCalledOnce();
  });

  it('step 2 opens Settings on Integrations', () => {
    render(<FirstRun />);
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }));
    expect(useUiStore.getState().settings).toBe(true);
    expect(useUiStore.getState().settingsSection).toBe('integrations');
  });

  it('step 3 waits for a project', () => {
    render(<FirstRun />);
    const button = screen.getByRole('button', { name: 'New session' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Add a project first');
  });
});
