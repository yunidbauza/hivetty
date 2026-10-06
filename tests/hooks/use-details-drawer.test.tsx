import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useDetailsDrawer } from '@/hooks/use-details-drawer';

function Harness() {
  const drawer = useDetailsDrawer();
  return (
    <>
      <button ref={drawer.button} type="button" onClick={drawer.toggle}>
        Details
      </button>
      {drawer.open ? <div ref={drawer.panel} role="dialog" aria-label="Drawer" tabIndex={-1} /> : null}
    </>
  );
}

describe('useDetailsDrawer (HIVE-225)', () => {
  it('opens onto the panel, and Escape closes it back to the button', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('dialog', { name: 'Drawer' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toHaveFocus();
  });

  it('toggles closed from the button', async () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Details' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
