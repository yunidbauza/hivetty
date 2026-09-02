import { Circle, Square, Triangle } from '@phosphor-icons/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TabBar } from '@components/ui/tab-bar';
import { TooltipProvider } from '@components/ui/tooltip';

/**
 * Deliberately non-Hive fixtures. `TabBar` is reused by the left rail (030) and
 * the activity rail (050); if a test here needed to know what "Projects" is,
 * the atom would have leaked domain knowledge.
 */
const TABS = [
  { id: 'alpha', label: 'Alpha', icon: Circle },
  { id: 'beta', label: 'Beta', badgeCount: 4, badgeLabel: 'widgets', icon: Square },
  { id: 'gamma', label: 'Gamma', badgeCount: 0, icon: Triangle },
];

describe('TabBar', () => {
  it('renders one tab per item, in order', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(
      screen.getAllByRole('tab').map((tab) => tab.getAttribute('id')),
    ).toEqual(['tab-alpha', 'tab-beta', 'tab-gamma']);
  });

  it('marks exactly the active tab as selected', () => {
    render(
      <TabBar tabs={TABS} active="beta" onSelect={vi.fn()} label="Sections" />,
    );

    expect(screen.getByRole('tab', { name: /Beta/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('fires onSelect with the tab id', async () => {
    const onSelect = vi.fn();
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={onSelect} label="Sections" />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Gamma' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('gamma');
  });

  /** `Badge` renders nothing at zero, so an empty count adds no visual noise. */
  it('shows a badge only for a positive count', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveTextContent(
      /^Gamma$/,
    );
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveTextContent(
      /^Alpha$/,
    );
  });

  /**
   * A tab's accessible name comes from its content, not from an `aria-label`,
   * so an unlabelled badge would be `aria-hidden` and the count would reach
   * nobody using a screen reader — the number is visible but unannounced.
   */
  it('folds the badge count into the tab’s accessible name', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(
      screen.getByRole('tab', { name: 'Beta 4 widgets' }),
    ).toBeInTheDocument();
  });

  it('names the tablist for screen readers', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(
      screen.getByRole('tablist', { name: 'Sections' }),
    ).toBeInTheDocument();
  });

  it('gives each tab a stable id so a panel can point back at it', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute(
      'id',
      'tab-alpha',
    );
  });

  it('underlines the active tab and greys the rest', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveClass(
      'border-brand',
      'text-ink',
    );
    expect(screen.getByRole('tab', { name: /Beta/ })).toHaveClass(
      'border-transparent',
      'text-subtle',
    );
  });

  /**
   * The label is right there beside it in horizontal mode; an icon that also
   * announced would make every tab's name say itself twice.
   */
  it('renders each tab icon as decoration, not as a second accessible name', () => {
    render(<TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />);

    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    expect(alpha.querySelector('svg')).not.toBeNull();
    expect(alpha.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards a className onto the tablist', () => {
    render(
      <TabBar
        tabs={TABS}
        active="alpha"
        onSelect={vi.fn()}
        label="Sections"
        className="shrink-0"
      />,
    );

    expect(screen.getByRole('tablist')).toHaveClass('shrink-0');
  });

  /**
   * The activity rail's unread count is an alarm, not an inventory: it means
   * agents are blocked on the user. The left rail's work count is neutral.
   */
  it('lets a tab ask for a louder badge', () => {
    render(
      <TabBar
        tabs={[
          {
            id: 'delta',
            label: 'Delta',
            icon: Circle,
            badgeCount: 3,
            badgeLabel: 'blocked things',
            badgeTone: 'danger',
          },
        ]}
        active="delta"
        onSelect={vi.fn()}
        label="Sections"
      />,
    );

    // A labelled badge puts the digit in an inner `aria-hidden` span, so the
    // fill lives on its parent.
    expect(screen.getByText('3').parentElement).toHaveClass('bg-danger-solid');
  });

  it('defaults to the quiet badge', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(screen.getByText('4').parentElement).toHaveClass('bg-chip');
  });
});

describe('strip orientation', () => {
  it('renders icon-only buttons that still have accessible names', () => {
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('keeps a badge count in the accessible name', () => {
    // A count chip does not fit 44px, but the unread count is the reason
    // the rail is worth looking at — losing it to a collapse would defeat
    // the feature. So it becomes a dot, and the number goes to the label.
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Beta, 4 widgets' })).toBeInTheDocument();
  });

  it('renders no dot for a zero count', () => {
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Gamma' })).toBeInTheDocument();
  });
});

describe('strip tooltips', () => {
  /**
   * `TooltipTrigger asChild` clones its child rather than wrapping it in a
   * fresh element, so the trigger's own `data-slot` lands directly on the tab
   * button instead of on some wrapper `getByRole('tab', …)` would then have to
   * see through. Asserting the attribute on the button itself is what proves
   * `asChild` was used correctly — the regression this guards against
   * (forgetting `asChild`) would nest the button inside a second, real
   * `<button>` and break every `getByRole('tab', …)` query in this suite and
   * in the rail tests.
   */
  it('wraps a strip tab directly in a tooltip trigger, adding no wrapper element', () => {
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute(
      'data-slot',
      'tooltip-trigger',
    );
  });

  /**
   * A horizontal tab has a visible label right beside it — a tooltip would be
   * redundant, and this is the other half of the "strip mode only" contract.
   */
  it('leaves a horizontal tab unwrapped', () => {
    render(
      <TabBar tabs={TABS} active="alpha" onSelect={vi.fn()} label="Sections" />,
    );

    expect(
      screen.getByRole('tab', { name: 'Alpha' }),
    ).not.toHaveAttribute('data-slot');
  });

  /**
   * Radix only mounts `TooltipContent` once its `Tooltip` is open, and opening
   * on hover is real pointer/timer behaviour `happy-dom` cannot lay out —
   * that case belongs to `rail-collapse.spec.ts` (Playwright), not here.
   * Focus opens a tooltip too (the keyboard-accessible path, and the same one
   * `TooltipTrigger` wires up with no delay), so it is what a plumbing-only
   * unit test can drive without touching positioning or timing.
   */
  it('gives the tooltip the same text as the accessible name', () => {
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
        />
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole('tab', { name: 'Alpha' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Alpha');
  });

  it('gives the tooltip the badge-count form of the name, matching the label exactly', () => {
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
        />
      </TooltipProvider>,
    );

    const beta = screen.getByRole('tab', { name: 'Beta, 4 widgets' });
    fireEvent.focus(beta);

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      beta.getAttribute('aria-label') ?? '',
    );
  });

  /**
   * `tooltipSide` is the whole reason a rail on the right edge does not run
   * its tooltip off the screen (`rail-collapse.spec.ts` proves it visually);
   * here it is enough to confirm the prop actually reaches `TooltipContent`.
   */
  it('opens toward the requested side', () => {
    render(
      <TooltipProvider>
        <TabBar
          tabs={TABS}
          active="alpha"
          onSelect={vi.fn()}
          label="Sections"
          orientation="strip"
          tooltipSide="left"
        />
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole('tab', { name: 'Alpha' }));
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-side', 'left');
  });
});

describe('onActiveSelect', () => {
  it('fires on the active tab and does not call onSelect', async () => {
    const onSelect = vi.fn();
    const onActiveSelect = vi.fn();
    render(
      <TabBar
        tabs={TABS}
        active="alpha"
        onSelect={onSelect}
        onActiveSelect={onActiveSelect}
        label="Sections"
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Alpha' }));

    expect(onActiveSelect).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('fires onSelect on a different tab and not onActiveSelect', async () => {
    const onSelect = vi.fn();
    const onActiveSelect = vi.fn();
    render(
      <TabBar
        tabs={TABS}
        active="alpha"
        onSelect={onSelect}
        onActiveSelect={onActiveSelect}
        label="Sections"
      />,
    );

    await userEvent.click(screen.getByRole('tab', { name: /Beta/ }));

    expect(onSelect).toHaveBeenCalledWith('beta');
    expect(onActiveSelect).not.toHaveBeenCalled();
  });

  it('still calls onSelect on the active tab when no onActiveSelect is given', async () => {
    // Every existing caller passes only onSelect and must be unaffected.
    const onSelect = vi.fn();
    render(<TabBar tabs={TABS} active="alpha" onSelect={onSelect} label="Sections" />);

    await userEvent.click(screen.getByRole('tab', { name: 'Alpha' }));

    expect(onSelect).toHaveBeenCalledWith('alpha');
  });
});
