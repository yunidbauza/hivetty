import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { AgentsPanel } from '@features/agents/components/agents-panel';
import type { AgentSummary } from '@shared/agent-contract';
import { useHiveStore } from '@stores/hive-store';
import { type AgentGroupKey, useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

/** The three fixture agents, in `agentOrder`. */
const FIXTURE_AGENTS = [['slack-agent'], ['pr-reviewer'], ['standup-agent']] as const;

const agentRow = (id: string) =>
  screen.getByRole('button', { name: new RegExp(`^${id}`) });

/**
 * Every row, and never the header's +, a lane
 * header or a row's slot actions (HIVE-116, HIVE-204).
 *
 * Those are buttons in the same panel, so a bare `getAllByRole('button')`
 * counts them as tenants. Filtering here keeps these assertions exact rather
 * than loosening them to "a few more than the rows".
 */
const agentRows = () =>
  screen
    .getAllByRole('button')
    .filter(
      (button) =>
        button.getAttribute('aria-label') !== 'New agent' &&
        !/^(Run .* now|Pause .*|Resume .*)$/.test(button.getAttribute('aria-label') ?? '') &&
        !button.hasAttribute('aria-expanded'),
    );

describe('AgentsPanel', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    useUiStore.getState().reset();
  });

  /**
   * The state a fresh launch is actually in.
   *
   * Three agents used to be seeded into the store at boot — a Slack watcher, a
   * PR reviewer, a standup writer — none of which anything could start or stop.
   * Nothing creates a background agent yet, so the panel says that instead of
   * listing three that do not exist.
   */
  it('offers New agent when empty', () => {
    useHiveStore.getState().reset();

    render(<AgentsPanel />);

    expect(screen.getByText(/No agents yet\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New agent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ New agent…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('renders every seeded agent, in agentOrder', () => {
    render(<AgentsPanel />);

    const ids = agentRows().map(
      (row) => row.textContent?.match(/^[a-z-]+/)?.[0],
    );

    expect(ids).toEqual(FIXTURE_AGENTS.map(([id]) => id));
  });

  it.each(FIXTURE_AGENTS)('shows %s by name', (id) => {
    render(<AgentsPanel />);

    expect(agentRow(id)).toBeInTheDocument();
    expect(screen.getByText(id)).toBeInTheDocument();
  });

  it('gives each agent its own icon', () => {
    render(<AgentsPanel />);

    // The first svg is the hexagon every tile shares; the glyph sits inside it.
    const glyphs = agentRows().map((row) => row.querySelectorAll('svg')[1]?.innerHTML);

    expect(new Set(glyphs).size).toBe(3);
    expect(glyphs.every(Boolean)).toBe(true);
  });

  it('opens an agent’s terminal when clicked', async () => {
    render(<AgentsPanel />);

    await userEvent.click(agentRow('pr-reviewer'));

    expect(useUiStore.getState().activeTab).toBe('pr-reviewer');
  });

  it('highlights the agent whose page is open', () => {
    useUiStore.getState().openAgentPage('standup-agent', 'activity');
    render(<AgentsPanel />);

    expect(agentRow('standup-agent')).toHaveClass('bg-active');
    expect(agentRow('standup-agent')).toHaveAttribute('aria-current', 'true');
    expect(agentRow('slack-agent')).not.toHaveClass('bg-active');
  });

  it('moves the highlight when another agent opens', async () => {
    render(<AgentsPanel />);

    await userEvent.click(agentRow('slack-agent'));
    expect(agentRow('slack-agent')).toHaveClass('bg-active');

    await userEvent.click(agentRow('pr-reviewer'));
    expect(agentRow('pr-reviewer')).toHaveClass('bg-active');
    expect(agentRow('slack-agent')).not.toHaveClass('bg-active');
  });

  it('highlights nothing while a session tab is open', () => {
    useUiStore.getState().openTab('hero-refresh');
    render(<AgentsPanel />);

    for (const [id] of FIXTURE_AGENTS) {
      expect(agentRow(id)).not.toHaveClass('bg-panel-2');
    }
  });

  /** State is never carried by the tile's colour alone (HIVE-114, HIVE-204). */
  it('names each state in words as well as colour', () => {
    render(<AgentsPanel />);

    for (const [id] of FIXTURE_AGENTS) {
      expect(agentRow(id)).toHaveAccessibleName(new RegExp(`^${id}, sleeping`));
    }
  });

  /**
   * A definition that failed to parse is *listed*, not hidden (HIVE-114).
   *
   * The row shows the reason where a working agent shows its description,
   * because a broken file has no description to show and the reason is the one
   * thing that helps the user fix it.
   */
  it('shows a broken definition with its reason', () => {
    act(() => {
      useHiveStore.getState().hydrateAgents([
        {
          name: 'broken',
          description: '',
          icon: 'Warning',
          status: 'sleeping',
          wake: { on: [] },
          mcp: [],
          tools: [],
          rotateAfter: 50,
          runs: [],
          invalid: 'nope: Unknown key. Remove it or fix the spelling.',
        },
      ]);
    });

    render(<AgentsPanel />);

    expect(screen.getByText(/Unknown key/)).toBeInTheDocument();
    expect(screen.getByText('invalid')).toBeInTheDocument();
  });

  it('still lets a broken definition be opened, so it can be fixed', () => {
    act(() => {
      useHiveStore.getState().hydrateAgents([
        {
          name: 'broken',
          description: '',
          icon: 'Warning',
          status: 'sleeping',
          wake: { on: [] },
          mcp: [],
          tools: [],
          rotateAfter: 50,
          runs: [],
          invalid: 'nope: Unknown key.',
        },
      ]);
    });

    render(<AgentsPanel />);

    expect(agentRow('broken')).toBeEnabled();
  });

  it('skips an id that is not an agent', () => {
    act(() => {
      useHiveStore.setState({ agentOrder: ['hero-refresh', 'slack-agent'] });
    });

    render(<AgentsPanel />);

    expect(agentRows()).toHaveLength(1);
    expect(agentRow('slack-agent')).toBeInTheDocument();
  });

  it('skips an id the store does not know', () => {
    act(() => {
      useHiveStore.setState({ agentOrder: ['ghost', 'slack-agent'] });
    });

    render(<AgentsPanel />);

    expect(agentRows()).toHaveLength(1);
  });

  /**
   * Grouping by state (HIVE-116).
   *
   * A rail is read to answer "what needs me", not "what do I have", which is
   * what the groups put first. The ordering rules themselves are
   * `useAgentsByGroup`'s and are tested there; these are about the panel
   * drawing what it is handed.
   */
  describe('grouped by state', () => {
    const summary = (name: string, status: AgentSummary['status']) => ({
      name,
      description: `${name} watches things`,
      icon: 'ph-robot',
      status,
      wake: { on: [] },
      mcp: [],
      tools: [],
      rotateAfter: 50,
      runs: [],
    });

    const seed = (...agents: ReturnType<typeof summary>[]) => {
      act(() => {
        useHiveStore.getState().hydrateAgents(agents);
      });
    };

    const laneHeader = (label: string) =>
      within(screen.getByRole('region', { name: label })).getByRole('button', {
        expanded: !useUiStore.getState().agentsFolded[
          label.toLowerCase() as AgentGroupKey
        ],
      });

    it('draws the lanes in order, each with its count (HIVE-204)', () => {
      seed(
        summary('asker', 'asking'),
        summary('broke', 'failed'),
        summary('busy', 'working'),
        summary('held', 'paused'),
      );

      render(<AgentsPanel />);

      expect(
        screen.getAllByRole('region').map((region) => region.getAttribute('aria-label')),
      ).toEqual(['Summons', 'Morphing', 'Burrowed']);
      expect(laneHeader('Summons')).toHaveTextContent('Summons2');
      expect(laneHeader('Morphing')).toHaveTextContent('Morphing1');
      expect(laneHeader('Burrowed')).toHaveTextContent('Burrowed1');
    });

    it('omits a lane with nothing in it, rather than a header reading zero', () => {
      seed(summary('sleeper', 'sleeping'));

      render(<AgentsPanel />);

      expect(screen.getByRole('region', { name: 'Burrowed' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Summons' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Morphing' })).not.toBeInTheDocument();
    });

    it('counts summons in amber and morphing in green in the header', () => {
      seed(
        summary('asker', 'asking'),
        summary('broke', 'failed'),
        summary('busy', 'working'),
        summary('builder', 'working'),
      );

      render(<AgentsPanel />);

      const heading = screen.getByRole('heading', { name: 'Agents' });
      const counts = heading.nextElementSibling as HTMLElement;

      expect(counts).toHaveTextContent('2 summons · 2 morphing');
      expect(screen.getByText('2 summons')).toHaveClass('text-amber-text');
      expect(screen.getByText('2 morphing')).toHaveClass('text-green');
    });

    it('drops a count at zero, and its separator', () => {
      seed(summary('busy', 'working'), summary('sleeper', 'sleeping'));

      render(<AgentsPanel />);

      const counts = screen.getByRole('heading', { name: 'Agents' })
        .nextElementSibling as HTMLElement;

      expect(counts).toHaveTextContent(/^1 morphing$/);
    });

    it('folds a lane from its header, and unfolds it again', async () => {
      seed(summary('busy', 'working'), summary('sleeper', 'sleeping'));

      render(<AgentsPanel />);

      const header = laneHeader('Burrowed');
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await userEvent.click(header);

      expect(header).toHaveAttribute('aria-expanded', 'false');
      expect(agentRows()).toHaveLength(1);
      expect(agentRow('busy')).toBeInTheDocument();

      await userEvent.click(header);

      expect(header).toHaveAttribute('aria-expanded', 'true');
      expect(agentRows()).toHaveLength(2);
    });
  });

  describe('the way to make another one', () => {
    it('the head’s + opens a never-saved agent page on Definition (HIVE-204)', async () => {
      render(<AgentsPanel />);

      await userEvent.click(screen.getByRole('button', { name: 'New agent' }));

      expect(useUiStore.getState().agentPage).toEqual({ name: null, view: 'definition' });
      expect(useUiStore.getState().settings).toBe(false);
    });

    it('draws no footer line beside it', () => {
      render(<AgentsPanel />);

      expect(screen.queryByRole('button', { name: '+ New agent…' })).not.toBeInTheDocument();
    });

    it('does the same from the empty state', async () => {
      useHiveStore.getState().reset();

      render(<AgentsPanel />);

      await userEvent.click(screen.getByRole('button', { name: 'New agent' }));

      expect(useUiStore.getState().agentPage).toEqual({ name: null, view: 'definition' });
    });
  });
});
