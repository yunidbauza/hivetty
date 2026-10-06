import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog';

function Open() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Pick a folder</DialogTitle>
        <DialogDescription>Where the repository lives</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

describe('DialogContent', () => {
  it('draws its surface from the app tokens', () => {
    render(<Open />);
    expect(screen.getByRole('dialog')).toHaveClass('bg-panel', 'border-border', 'text-ink');
  });

  it('rings the close X in brand on keyboard focus only, with no white offset', () => {
    render(<Open />);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('focus-visible:ring-1', 'focus-visible:ring-brand', 'outline-none');
    expect(close.className).not.toMatch(/ring-offset|focus:ring/);
  });

  it('mutes the description with the app’s own muted', () => {
    render(<Open />);
    expect(screen.getByText('Where the repository lives')).toHaveClass('text-muted');
  });

  it('lays the one scrim behind the dialog', () => {
    render(<Open />);
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass('bg-scrim');
  });
});
