import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConsolePeek } from '@features/orchestrator/components/console-peek';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

describe('ConsolePeek (HIVE-197)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    useHiveStore.setState({
      orchLines: [
        { text: 'first', color: 'dim' },
        { text: 'routed → INCORP-589', color: 'blue' },
      ],
    });
  });

  it('folded: the last line and Show the console', async () => {
    render(<ConsolePeek />);
    expect(screen.getByText('routed → INCORP-589')).toBeInTheDocument();
    expect(screen.queryByText('first')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show the console/ }));
    expect(useUiStore.getState().consoleShown).toBe(true);
  });

  it('shown: no peek line, and the same control folds it', async () => {
    useUiStore.setState({ consoleShown: true });
    render(<ConsolePeek />);
    expect(screen.queryByText('routed → INCORP-589')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Hide the console/ }));
    expect(useUiStore.getState().consoleShown).toBe(false);
  });

  it('an empty console peeks an empty line', () => {
    useHiveStore.setState({ orchLines: [] });
    render(<ConsolePeek />);
    expect(screen.getByRole('button', { name: /Show the console/ })).toBeInTheDocument();
  });
});
