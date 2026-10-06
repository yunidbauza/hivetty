import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WhatsNewDialog } from '@features/whats-new/components/whats-new-dialog';
import { RELEASES } from '@features/whats-new/releases';

/** The What's new card (1.0, variant A). */
const entry = RELEASES.find((r) => r.version === '1.0')!;
const setup = () => {
  const onClose = vi.fn();
  render(<WhatsNewDialog entry={entry} onClose={onClose} />);
  return { onClose, user: userEvent.setup() };
};
const title = () => screen.getByRole('dialog').querySelector('h2')?.textContent;

describe('WhatsNewDialog', () => {
  it('opens on the first slide, named by its title, under a quiet eyebrow and no slide counter', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Home is the comb' })).toBeInTheDocument();
    expect(screen.getByText('What’s new in 1.0')).toBeInTheDocument();
    expect(screen.queryByText(/of 3/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(document.querySelector('[data-piece]')).toHaveAttribute('data-piece', 'comb');
  });

  it('walks the slides with Next and Back, and the corner piece follows', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(title()).toBe('Jira, from ticket to Done');
    expect(document.querySelector('[data-piece]')).toHaveAttribute('data-piece', 'ticket');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(title()).toBe('Home is the comb');
  });

  it('jumps with the dots, and moves with the arrow keys', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Pull requests, without leaving' }));
    expect(title()).toBe('Pull requests, without leaving');
    await user.keyboard('{ArrowLeft}');
    expect(title()).toBe('Jira, from ticket to Done');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(title()).toBe('Pull requests, without leaving');
  });

  it('closes from the last slide, keeping the box unticked', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Pull requests, without leaving' }));
    await user.click(screen.getByRole('button', { name: 'Start using 1.0' }));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('passes the box’s answer whichever way it closes', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('checkbox', { name: 'Don’t show What’s new again' }));
    await user.click(screen.getByRole('button', { name: 'Close What\'s new' }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('closes on Esc', async () => {
    const { onClose, user } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
