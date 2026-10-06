import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { endedReason, type Session, type Terminal } from '@/types/entity';

import { SessionHeader } from '@components/layout/session-header';
import * as platform from '@lib/platform';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

const hero = () => useHiveStore.getState().entities['hero-refresh'] as Session;

describe('SessionHeader (HIVE-197)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
  });

  it('reads ‹, the title over project · branch, the status and the model', () => {
    useUiStore.getState().openTab('hero-refresh', 'sessions');
    render(<SessionHeader entity={hero()} />);
    expect(screen.getByRole('button', { name: 'Back to overmind' })).toBeInTheDocument();
    expect(screen.getByText('hero-refresh')).toHaveAttribute('title', hero().task);
    expect(screen.getByText('nova-web · feat/hero-refresh')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    const slot = screen.getByTestId('session-header').querySelector('[data-slot="model"]');
    expect(slot?.querySelector('[data-testid="model-chip"]')).not.toBeNull();
  });

  it('draws the back control as the caret alone, named for the reader (HIVE-213)', () => {
    render(<SessionHeader entity={hero()} />);
    const back = screen.getByRole('button', { name: 'Back to overmind' });
    expect(back).toHaveTextContent(/^$/);
    expect(back.getAttribute('title')).toMatch(/^Back to overmind \(/);
    expect(back.className).toContain('size-7');
  });

  it('sizes the model slot to its content and renders every metric (HIVE-213)', () => {
    useUiStore.setState({ activeTab: 'hero-refresh' });
    act(() =>
      useHiveStore.getState().setSessionMetrics('hero-refresh', {
        contextPct: 46,
        fiveHourPct: 12,
        sevenDayPct: 63,
        fiveHourResetsAt: new Date(2026, 7, 11, 14, 30).getTime() / 1000,
        sevenDayResetsAt: new Date(2026, 7, 13, 17, 0).getTime() / 1000,
      }),
    );
    render(<SessionHeader entity={hero()} />);
    const slot = screen.getByTestId('session-header').querySelector('[data-slot="model"]')!;
    expect(slot.className).not.toMatch(/w-\[200px\]/);
    expect(screen.getByTestId('session-header').className).toContain('@container');
    const chip = within(slot as HTMLElement).getByTestId('model-chip');
    expect(chip).toHaveTextContent(/ctx/);
    expect(chip.querySelectorAll('[data-detail="long"]')).toHaveLength(2);
  });

  it('moves the status word to the dot title for the narrowest step (HIVE-213)', () => {
    render(<SessionHeader entity={hero()} />);
    const status = screen.getByTestId('session-status');
    // 720px of content: the row needs ~705 with the word, and 1200px with one rail open leaves 738 (the rails' grip gutters, #71).
    expect(within(status).getByText(/./, { selector: '[data-word]' }).className).toContain('@max-[720px]:sr-only');
    expect(status.getAttribute('title')).not.toBeNull();
  });

  it('lets the model slot clip at its end rather than push the menu out (HIVE-220)', () => {
    render(<SessionHeader entity={hero()} />);
    const slot = screen.getByTestId('session-header').querySelector('[data-slot="model"]')!;
    expect(slot).toHaveClass('min-w-0', 'shrink', 'overflow-hidden');
    expect(slot).not.toHaveClass('shrink-0');
  });

  it('lowers the title column floor at the narrowest step (HIVE-220)', () => {
    render(<SessionHeader entity={hero()} />);
    const column = screen.getByText('hero-refresh').parentElement!;
    // 96px: beside both rails at 1200px the chip's last step (icon and three percentages) needs the room.
    expect(column).toHaveClass('min-w-[140px]', '@max-[500px]:min-w-[96px]');
  });

  it('gives the row’s spare width to the title alone, so only the slot clips (HIVE-220)', () => {
    render(<SessionHeader entity={hero()} />);
    const column = screen.getByText('hero-refresh').parentElement!;
    expect(column).toHaveClass('flex-1', 'basis-0');
  });

  it('names the back chord for the platform in the button title', () => {
    const spy = vi.spyOn(platform, 'isMacPlatform');
    spy.mockReturnValue(false);
    const { unmount } = render(<SessionHeader entity={hero()} />);
    expect(screen.getByRole('button', { name: 'Back to overmind' })).toHaveAttribute(
      'title',
      'Back to overmind (Ctrl+Shift+←)',
    );
    unmount();
    spy.mockReturnValue(true);
    render(<SessionHeader entity={hero()} />);
    expect(screen.getByRole('button', { name: 'Back to overmind' })).toHaveAttribute('title', 'Back to overmind (⌘[)');
    spy.mockRestore();
  });

  it('‹ goes back and selects the session', async () => {
    useUiStore.setState({ activeTab: 'hero-refresh' });
    render(<SessionHeader entity={hero()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to overmind' }));
    expect(useUiStore.getState().activeTab).toBe('orch');
    expect(useUiStore.getState().selId).toBe('hero-refresh');
  });

  it('the menu holds Terminal here', async () => {
    const spawn = vi.fn();
    useHiveStore.setState({ spawnTerminalBeside: spawn });
    render(<SessionHeader entity={hero()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Session menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Terminal here/ }));
    expect(spawn).toHaveBeenCalledWith('hero-refresh');
  });

  it('over a terminal: the terminal glyph, its name, project · cwd, its state, no model and no menu', () => {
    const t: Terminal = {
      kind: 'terminal',
      id: 'term-5',
      project: 'ai-sdk',
      cwd: '/repos/ai-sdk',
      status: 'prompt',
      createdAt: 1,
      lines: [],
    };
    render(<SessionHeader entity={t} />);
    // Sans like every other name: mono is for code and consoles only.
    expect(screen.getByText('term-5')).not.toHaveClass('font-mono');
    expect(screen.getByText(/^ai-sdk · /)).toBeInTheDocument();
    expect(screen.getByText('at prompt')).toBeInTheDocument();
    expect(screen.getByTestId('session-header').querySelector('[data-slot="model"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Session menu' })).not.toBeInTheDocument();
  });

  it('the menu links the session’s PR', async () => {
    render(<SessionHeader entity={hero()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Session menu' }));
    expect(screen.getByRole('menuitem', { name: /Open PR #482/ })).toHaveAttribute(
      'href',
      expect.stringContaining('482'),
    );
  });
});

describe('SessionHeader, an ended session (HIVE-211)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
  });

  it('reads Ended, muted, with the reason as its title and in its name', () => {
    const ended: Session = { ...hero(), status: 'terminated' };
    render(<SessionHeader entity={ended} />);
    const status = screen.getByLabelText(`Ended: ${endedReason(ended)}`);
    expect(status).toHaveTextContent('Ended');
    expect(status).toHaveAttribute('title', endedReason(ended));
    expect(status).toHaveClass('text-muted');
  });

  it('a finished session reads Ended too', () => {
    const ended: Session = { ...hero(), status: 'done', endedBy: 'finished' };
    render(<SessionHeader entity={ended} />);
    expect(screen.getByLabelText(`Ended: ${endedReason(ended)}`)).toHaveTextContent('Ended');
  });

  it('a cleared row is not ended, and keeps its status word', () => {
    const cleared: Session = { ...hero(), status: 'done', endedBy: 'cleared' };
    render(<SessionHeader entity={cleared} />);
    expect(screen.queryByText('Ended')).toBeNull();
  });
});
