import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TerminalRow } from '@features/projects/components/terminal-row';
import { resetProjectConfig } from '@lib/project-config';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet, seedDemoProjectConfig } from '@tests/support/demo-fleet';

/**
 * One terminal beneath its project (terminals).
 *
 * Asserted against the real store rather than a hand-built entity: the row's
 * whole job is to draw what `spawnTerminal` created, and only the store knows
 * what that is — the `cwd` it resolves from the config included, which is why
 * the project config is seeded here as well as the fleet.
 */

const row = () => screen.getByRole('button');

describe('TerminalRow', () => {
  let id: string;

  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    seedDemoProjectConfig();
    useUiStore.getState().reset();
    id = useHiveStore.getState().spawnTerminal('nova-web');
    // The spawn opens its own tab; the row is only *current* once clicked.
    useUiStore.getState().backToOrch();
  });

  afterEach(() => {
    resetProjectConfig();
  });

  it('reads the id and at prompt, in subtle, with the directory beneath', () => {
    render(<TerminalRow id={id} />);

    expect(screen.getByText(id)).toBeInTheDocument();
    const label = screen.getByText('at prompt');
    // Subtle, not green: a shell sitting at its prompt is not working.
    expect(label.className).toContain('text-subtle');
    expect(label.className).not.toContain('text-green');
    // The directory's tail, where a session row shows its branch — a terminal
    // knows where it started and nothing about git.
    expect(screen.getByText('nova-web')).toBeInTheDocument();
  });

  it('reads the foreground name in brand while running', () => {
    act(() => useHiveStore.getState().setTerminalForeground(id, 'vitest'));
    render(<TerminalRow id={id} />);

    const label = screen.getByText('vitest');
    expect(label.className).toContain('text-brand');
    expect(label.className).not.toContain('text-amber');
  });

  it('carries the terminal glyph, hidden from the accessibility tree', () => {
    render(<TerminalRow id={id} />);

    // Decoration: the label beside it already carries the state in words.
    expect(row().querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('opens its tab on click and marks itself current', async () => {
    render(<TerminalRow id={id} />);

    await userEvent.click(row());

    expect(useUiStore.getState().activeTab).toBe(id);
    expect(row()).toHaveAttribute('aria-current', 'true');
  });

  it('renders nothing for a session id', () => {
    const { container } = render(<TerminalRow id="hero-refresh" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an id the store does not know', () => {
    const { container } = render(<TerminalRow id="term-nope" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('reads lost, in muted, once the shell has died — never the stale foreground', () => {
    act(() => {
      useHiveStore.getState().setTerminalForeground(id, 'vitest');
      useHiveStore.getState().markTerminalLost(id, 'the pty host crashed');
    });
    render(<TerminalRow id={id} />);

    const label = screen.getByText('lost');
    expect(label.className).toContain('text-muted');
    expect(label.className).not.toContain('text-brand');
    expect(screen.queryByText('vitest')).toBeNull();
  });
});
