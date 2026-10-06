import { act, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Session } from '@/types/entity';

import { SessionRow } from '@features/projects/components/session-row';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import type { PlanTaskStatus, SessionPlan } from '@shared/plan-contract';
import { seedDemoFleet } from '@tests/support/demo-fleet';
import { notif } from '@tests/support/notifications';

const row = () => screen.getByRole('button');

describe('SessionRow', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    useUiStore.getState().reset();
  });

  it('pills the id after a session that has a name of its own', () => {
    const { rerender } = render(<SessionRow id="hero-refresh" />);
    // Unnamed, the label already is the id: one of it, not two.
    expect(screen.getAllByText('hero-refresh')).toHaveLength(1);

    act(() => useHiveStore.getState().renameSession('hero-refresh', 'hero-tokens'));
    rerender(<SessionRow id="hero-refresh" />);
    expect(screen.getByText('hero-tokens')).toBeInTheDocument();
    expect(screen.getByText('hero-refresh')).toHaveClass('rounded-full');
  });

  it('shows the session id, its status label, and its branch', () => {
    render(<SessionRow id="hero-refresh" />);

    expect(screen.getByText('hero-refresh')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(screen.getByText('feat/hero-refresh')).toBeInTheDocument();
  });

  it('renders an em dash for a session with no observed branch', () => {
    /**
     * HIVE-78. This row used to read `feat/sess-01` for a session sitting on
     * `main` — a branch nothing had created. An em dash is a smaller claim and
     * an honest one, and it is what every session shows for the moment between
     * spawning and main's first `git rev-parse` coming back.
     */
    const id = useHiveStore.getState().spawnSession('nova-web');
    render(<SessionRow id={id} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/^feat\/sess-/)).not.toBeInTheDocument();
  });

  it('renders the branch once main has observed one', () => {
    const id = useHiveStore.getState().spawnSession('nova-web');
    act(() =>
      useHiveStore
        .getState()
        .setSessionBranch(id, 'feat/incorp-332', '/repo/.claude/worktrees/x'),
    );

    render(<SessionRow id={id} />);

    expect(screen.getByText('feat/incorp-332')).toBeInTheDocument();
  });

  /** The one status whose label is not its own name. */
  it('renders waiting as "needs input"', () => {
    render(<SessionRow id="lead-form" />);

    expect(screen.getByText('needs input')).toBeInTheDocument();
    expect(screen.queryByText('waiting')).not.toBeInTheDocument();
  });

  it('colours the status label to match its dot', () => {
    render(<SessionRow id="lead-form" />);

    expect(screen.getByText('needs input')).toHaveClass('text-amber-text');
  });

  it('opens the session’s tab when clicked', async () => {
    render(<SessionRow id="webhooks" />);

    await userEvent.click(row());

    expect(useUiStore.getState().activeTab).toBe('webhooks');
  });

  it('highlights the row whose tab is open', () => {
    useUiStore.getState().openTab('hero-refresh');
    render(<SessionRow id="hero-refresh" />);

    expect(row()).toHaveClass('bg-active');
    expect(row()).toHaveAttribute('aria-current', 'true');
  });

  it('leaves an inactive row unhighlighted', () => {
    useUiStore.getState().openTab('webhooks');
    render(<SessionRow id="hero-refresh" />);

    expect(row()).not.toHaveClass('bg-active');
    expect(row()).not.toHaveAttribute('aria-current');
  });

  /**
   * The simulation (061) and the spawn flow (044) both mutate entities under
   * open panels, so a row that assumes its entity exists is a race waiting to
   * throw.
   */
  it('renders nothing for an unknown id', () => {
    const { container } = render(<SessionRow id="does-not-exist" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an agent id', () => {
    const { container } = render(<SessionRow id="slack-agent" />);

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * HIVE-83: a quiet session is not necessarily an empty one — the label says
   * what is still running, and the dot goes hollow to match.
   */
  it('names what a quiet session is still running, and hollows the comb', () => {
    act(() => {
      useHiveStore.getState().setSessionStatus('rails-upgrade', 'idle', 'agents');
    });

    render(
      <>
        <SessionRow id="rails-upgrade" />
        <SessionRow id="hero-refresh" />
      </>,
    );

    expect(screen.getByText('working (agents)')).toBeInTheDocument();
    const [quiet, busy] = screen.getAllByRole('button').map((b) => b.querySelector('svg'));
    // Both green — the label says working — and only the shape tells them apart.
    expect(quiet).toHaveClass('text-green');
    expect(busy).toHaveClass('text-green', 'animate-ccpulse');
    expect(quiet).not.toHaveClass('animate-ccpulse');
    expect(quiet?.innerHTML).not.toBe(busy?.innerHTML);
  });

  it('draws a plain idle session as a hollow grey comb', () => {
    act(() => {
      useHiveStore.getState().setSessionStatus('rails-upgrade', 'idle');
    });
    render(<SessionRow id="rails-upgrade" />);

    expect(row().querySelector('svg')).toHaveClass('text-subtle');
  });

  it('follows the store when the session’s status changes', () => {
    render(<SessionRow id="hero-refresh" />);
    expect(screen.getByText('working')).toBeInTheDocument();

    act(() => {
      useHiveStore.getState().appendEntityLines('hero-refresh', [], 'waiting');
    });

    expect(screen.getByText('needs input')).toBeInTheDocument();
  });
});

/**
 * Plan progress on the row (HIVE-182): a green `done/total` beside the status
 * label, absent without a plan. The status dot stays first and keeps priority.
 */
describe('SessionRow — plan progress', () => {
  const plan = (entityId: string, statuses: PlanTaskStatus[]): SessionPlan => ({
    entityId,
    source: 'task-tools',
    allDone: false,
    tasks: statuses.map((status, index) => ({ id: String(index + 1), title: `T${String(index + 1)}`, status })),
  });

  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    useUiStore.getState().reset();
  });

  it('shows done/total after the status label, and says what it counts', () => {
    act(() => useHiveStore.getState().setPlan('hero-refresh', plan('hero-refresh', ['completed', 'in_progress', 'pending'])));
    render(<SessionRow id="hero-refresh" />);

    const count = within(row()).getByText('1/3');
    expect(count).toBeInTheDocument();
    expect(within(row()).getByText('1/3 tasks done')).toHaveClass('sr-only');
    // After the status label, never before the dot.
    const label = within(row()).getByText('working');
    expect(label.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows nothing without a plan', () => {
    render(<SessionRow id="hero-refresh" />);

    expect(within(row()).queryByText(/tasks done/)).toBeNull();
  });

  it('follows the plan as tasks complete', () => {
    act(() => useHiveStore.getState().setPlan('hero-refresh', plan('hero-refresh', ['completed', 'pending', 'pending'])));
    render(<SessionRow id="hero-refresh" />);

    act(() => useHiveStore.getState().setPlan('hero-refresh', plan('hero-refresh', ['completed', 'completed', 'pending'])));

    expect(within(row()).getByText('2/3')).toBeInTheDocument();
  });

  it("re-renders only the row whose plan changed", () => {
    let rendersA = 0;
    let rendersB = 0;
    render(
      <>
        <Profiler id="a" onRender={() => { rendersA += 1; }}>
          <SessionRow id="hero-refresh" />
        </Profiler>
        <Profiler id="b" onRender={() => { rendersB += 1; }}>
          <SessionRow id="lead-form" />
        </Profiler>
      </>,
    );
    const beforeA = rendersA;
    const beforeB = rendersB;

    act(() => useHiveStore.getState().setPlan('lead-form', plan('lead-form', ['completed', 'pending'])));

    expect(rendersB).toBeGreaterThan(beforeB);
    expect(rendersA).toBe(beforeA);
  });
});

describe('SessionRow — compact (HIVE-197)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
  });

  it('compact drops the branch line (HIVE-197)', () => {
    render(<SessionRow id="hero-refresh" compact />);
    expect(screen.queryByText('feat/hero-refresh')).not.toBeInTheDocument();
    expect(screen.getByText('hero-refresh')).toBeInTheDocument();
  });
});

describe('SessionRow — yours again (HIVE-198)', () => {
  const T = 'term-ya';
  const ID = 'sess-ya';
  const idle: Session = {
    kind: 'session',
    id: ID,
    terminalId: T,
    project: 'nova-web',
    status: 'idle',
    task: 'refresh the hero',
    cost: '$0.00',
    lines: [],
  };

  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    useHiveStore.setState({ entities: { [ID]: idle }, order: [ID] });
  });

  it('compact: reads "yours again" while an unswept session.idle row names it', () => {
    useHiveStore.getState().hydrateNotifs([notif({ kind: 'session.idle', action: { type: 'session', entityId: T } })]);
    render(<SessionRow id={ID} compact />);
    expect(screen.getByText('yours again')).toBeInTheDocument();
  });

  it('reads idle with nothing unswept', () => {
    render(<SessionRow id={ID} compact />);
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('never outside the compact row', () => {
    useHiveStore.getState().hydrateNotifs([notif({ kind: 'session.idle', action: { type: 'session', entityId: T } })]);
    render(<SessionRow id={ID} />);
    expect(screen.queryByText('yours again')).toBeNull();
  });
});
