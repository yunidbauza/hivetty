import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';

const renderPopover = () =>
  render(
    <>
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Body</PopoverContent>
      </Popover>
      <button type="button">Elsewhere</button>
    </>,
  );

describe('Popover (HIVE-196)', () => {
  it('opens on click, on the app surface', async () => {
    renderPopover();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Body');
    expect(dialog).toHaveClass('bg-panel', 'border-border');
  });

  it('closes on Esc, on a click outside, and on a second click', async () => {
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Open' });

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
