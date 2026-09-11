import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { isTerminal } from '@/types/entity';

import { TerminalEndedCover } from '@features/sessions/components/terminal-ended-cover';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

/**
 * What a terminal shows once its shell died unasked (terminals).
 *
 * The cover is a strip over a terminal that is still mounted, so both halves
 * matter: the reason has to be readable, and closing it has to take the row
 * away *and* the stage with it — a tab left pointing at an id nothing can
 * resolve is a blank centre with no way out.
 */
describe('TerminalEndedCover', () => {
  let id: string;

  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    id = useHiveStore.getState().spawnTerminal('nova-web');
    useHiveStore.getState().markTerminalLost(id, 'the pty host crashed');
  });

  const terminal = () => {
    const entity = useHiveStore.getState().entities[id];
    if (!entity || !isTerminal(entity)) throw new Error('no terminal');
    return entity;
  };

  it('shows the reason, over the terminal, as a status', () => {
    render(<TerminalEndedCover terminal={terminal()} />);

    const cover = screen.getByRole('status');
    expect(cover).toHaveTextContent('the pty host crashed');
    /*
      `absolute` is the whole difference between a cover and a replacement: the
      terminal underneath stays mounted and laid out, so the scrollback that
      says what the shell was doing when it died survives to be read.
    */
    expect(cover.className).toContain('absolute');
  });

  it('closes the terminal, removing it and leaving the stage', async () => {
    render(<TerminalEndedCover terminal={terminal()} />);

    await userEvent.click(screen.getByRole('button', { name: `Close ${id}` }));

    expect(useHiveStore.getState().entities[id]).toBeUndefined();
    expect(useUiStore.getState().activeTab).toBe('orch');
  });
});
