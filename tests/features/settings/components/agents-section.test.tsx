import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAgents } from '@/lib/agents';
import { resetShippedState } from '@/lib/shipped';

import { AgentsSection } from '@features/settings/components/agents-section';
import { useEditorStore } from '@stores/editor-store';
import { useUiStore } from '@stores/ui-store';

import type { AgentSummary } from '@shared/agent-contract';

import { shippedStatus } from '../../../support/shipped';

const GOOD = `---
name: slack-watcher
description: Watches things.
icon: Ghost
---
Do the job.
`;

const agent = (name: string, over: Partial<AgentSummary> = {}): AgentSummary => ({
  name,
  description: `${name} watches things`,
  icon: 'Ghost',
  status: 'sleeping',
  wake: { on: [] },
  mcp: [],
  tools: [],
  rotateAfter: 50,
  runs: [],
  ...over,
});

const stub = (agents: AgentSummary[], over: Record<string, unknown> = {}) => {
  const bridge = {
    list: vi.fn(async () => ({ agents, agentsRoot: '/root/agents' })),
    read: vi.fn(async () => GOOD),
    write: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => ({ ok: true })),
    onChanged: vi.fn(() => () => {}),
    ...over,
  };

  (window as unknown as { hive?: unknown }).hive = { agents: bridge };

  return bridge;
};

const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

beforeEach(() => {
  delete (window as unknown as { hive?: unknown }).hive;
  resetAgents();
  resetShippedState();
  useEditorStore.getState().reset();
  useUiStore.getState().reset();
  vi.restoreAllMocks();
});

describe('AgentsSection', () => {
  it('renders header-only without a bridge, which is the browser demo', () => {
    render(<AgentsSection />);

    expect(
      screen.getByText(/only available in the desktop app/i),
    ).toBeInTheDocument();
  });

  it('invites a first agent when the folder is empty', async () => {
    stub([]);
    render(<AgentsSection />);

    await screen.findByRole('button', { name: '+ New agent' });

    expect(screen.getByText(/Agents folder: \/root\/agents/)).toBeInTheDocument();
    const creature = document.querySelector('[data-creature]');
    expect(creature).toHaveAttribute('data-creature', 'mutalisk');
    expect(creature).toHaveStyle({ height: '120px' });
    expect(creature).toHaveClass('mb-9');
  });

  it('lists an agent with its state', async () => {
    stub([agent('slack-watcher')]);
    render(<AgentsSection />);

    expect(await screen.findByText('slack-watcher')).toBeInTheDocument();
    expect(screen.getByText('sleeping')).toBeInTheDocument();
  });

  it('stacks its list above the editor below a 520px section (HIVE-225)', async () => {
    stub([agent('slack-watcher')]);
    render(<AgentsSection />);
    const grid = (await screen.findByText('slack-watcher')).closest('.grid');
    expect(grid).toHaveClass('@min-[520px]:grid-cols-[190px_minmax(0,1fr)]', 'grid-rows-[minmax(0,10rem)_minmax(0,1fr)]');
    expect(grid?.parentElement).toHaveClass('@container');
  });

  it('names the agents folder', async () => {
    stub([agent('slack-watcher')]);
    render(<AgentsSection />);

    expect(
      await screen.findByText('Agents folder: /root/agents'),
    ).toBeInTheDocument();
  });

  describe('a broken definition', () => {
    it('is marked invalid', async () => {
      stub([agent('broken', { invalid: 'nope: Unknown key.' })]);
      render(<AgentsSection />);

      expect(await screen.findByText('invalid')).toBeInTheDocument();
    });

    it('can still be opened, so the user can fix it', async () => {
      // Unlike an invalid skill's row, which is disabled: an agent's folder
      // names it, so there is always a file to open.
      stub([agent('broken', { invalid: 'nope: Unknown key.' })]);
      render(<AgentsSection />);

      const target = await screen.findByRole('button', { name: /broken/ });

      expect(target).toBeEnabled();

      await userEvent.click(target);

      expect(await screen.findByText('/root/agents/broken/AGENT.md')).toBeInTheDocument();
      expect(useUiStore.getState().agentPage).toBeNull();
    });
  });

  describe('the list', () => {
    it('draws each agent with its own icon before the name', async () => {
      stub([agent('slack-watcher', { icon: 'ph-slack-logo' })]);
      render(<AgentsSection />);

      const target = await screen.findByRole('button', { name: /slack-watcher/ });

      expect(target.querySelector('svg')).not.toBeNull();
    });

    /*
      The Slack-watcher template (HIVE-123) is gone. It demonstrated the epic
      while agents were new; what it does now is offer a second "+ New agent"
      whose output the user has to read and then edit anyway.
    */
    it('offers nothing but New agent, in both states', async () => {
      stub([]);
      render(<AgentsSection />);

      await screen.findByRole('button', { name: '+ New agent' });

      expect(
        screen.queryByRole('button', { name: /Slack watcher/ }),
      ).not.toBeInTheDocument();
    });

    it('says what to do while nothing is open', async () => {
      stub([agent('slack-watcher')]);
      render(<AgentsSection />);

      expect(await screen.findByText('Select an agent, or write a new one.')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Source' })).toBeNull();
    });
  });

  /*
    Settings edits in place again, with Form | Source tabs: the agent page shows
    the same editor side by side, and both share the editor-store draft.
  */
  describe('editing in place', () => {
    it('opens an agent beside the list, with Settings still open and no page', async () => {
      stub([agent('slack-watcher')]);
      useUiStore.getState().openSettings('agents');
      render(<AgentsSection />);

      await userEvent.click(await screen.findByRole('button', { name: /slack-watcher/ }));

      expect(await screen.findByText('/root/agents/slack-watcher/AGENT.md')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Form' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Source' })).toBeInTheDocument();
      expect(row('slack-watcher')).toHaveAttribute('aria-current', 'true');
      expect(useUiStore.getState().settings).toBe(true);
      expect(useUiStore.getState().agentPage).toBeNull();
    });

    it('New agent writes a never-saved agent in Settings', async () => {
      stub([agent('slack-watcher')]);
      render(<AgentsSection />);

      await userEvent.click(await screen.findByRole('button', { name: '+ New agent' }));

      expect(await screen.findByText('not saved yet')).toBeInTheDocument();
      expect(useUiStore.getState().agentPage).toBeNull();
    });

    it('remounts for New agent even from an agent named new', async () => {
      stub([agent('new')]);
      render(<AgentsSection />);

      await userEvent.click(await screen.findByRole('button', { name: /^new/ }));
      await userEvent.click(await screen.findByRole('tab', { name: 'Source' }));
      await userEvent.click(screen.getByRole('button', { name: '+ New agent' }));

      // A fresh editor opens on Form; one reused from the agent named new would stay on Source.
      expect(await screen.findByText('not saved yet')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true');
    });

    it('New agent from the empty state does the same', async () => {
      stub([]);
      render(<AgentsSection />);

      await userEvent.click(await screen.findByRole('button', { name: '+ New agent' }));

      expect(await screen.findByText('not saved yet')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Source' })).toBeInTheDocument();
      expect(useUiStore.getState().agentPage).toBeNull();
    });

    it('goes back to the placeholder after a delete', async () => {
      const bridge = stub([agent('slack-watcher')]);
      render(<AgentsSection />);

      await userEvent.click(await screen.findByRole('button', { name: /slack-watcher/ }));
      await waitFor(() => expect(useEditorStore.getState().agentDrafts['slack-watcher']).toBeDefined());
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(
        within(screen.getByRole('alertdialog', { name: 'Delete slack-watcher?' })).getByRole('button', {
          name: 'Delete',
        }),
      );

      await waitFor(() => expect(bridge.remove).toHaveBeenCalledWith({ name: 'slack-watcher' }));
      expect(await screen.findByText('Select an agent, or write a new one.')).toBeInTheDocument();
    });
  });
});

describe('AgentsSection — shipped agents the user changed', () => {
  const changed = shippedStatus({
    name: 'slack-watcher',
    customised: [{ path: 'limits.parallel', yours: '5', shipped: '2' }],
    bodyEdited: true,
    held: true,
  });

  it('marks only the changed agent in the list', async () => {
    stub([agent('slack-watcher'), agent('pr-patrol')]);
    (window as unknown as { hive: Record<string, unknown> }).hive.shipped = {
      status: vi.fn(async () => [changed]),
    };
    render(<AgentsSection />);

    const dot = await screen.findByLabelText('A newer shipped prompt is waiting');

    expect(within(row('slack-watcher')).getByLabelText('A newer shipped prompt is waiting')).toBe(dot);
    expect(within(row('pr-patrol')).queryByRole('img')).toBeNull();
  });
});
