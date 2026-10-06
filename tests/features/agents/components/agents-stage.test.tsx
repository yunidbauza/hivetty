import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAgents } from '@/lib/agents';
import { resetShippedState } from '@/lib/shipped';

import { AgentsStage } from '@features/agents/components/agents-stage';
import { useEditorStore } from '@stores/editor-store';
import { useAgentsByGroup, useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

/** The Agents place's stage (HIVE-204): the shown agent's page — the last, else the next, else the first. */

beforeEach(() => {
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useEditorStore.getState().reset();
  resetAgents();
  resetShippedState();
  vi.stubGlobal('hive', {
    agents: {
      list: vi.fn(async () => ({ agents: [], agentsRoot: '/root/agents' })),
      read: vi.fn(async () => null),
      onChanged: vi.fn(() => () => {}),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AgentsStage', () => {
  it('opens the first agent in the panel when none was opened', () => {
    seedDemoFleet();
    const first = renderHook(() => useAgentsByGroup()).result.current[0].ids[0];
    render(<AgentsStage />);

    expect(screen.queryByText('Pick an agent')).toBeNull();
    expect(useUiStore.getState().agentPage).toEqual({ name: first, view: 'activity' });
  });

  it('opens the next agent when the shown one is deleted, the first when it was the last', () => {
    seedDemoFleet();
    const ids = renderHook(() => useAgentsByGroup()).result.current.flatMap((group) => group.ids);
    const remove = (id: string) =>
      act(() =>
        useHiveStore.setState((state) => {
          const entities = { ...state.entities };
          delete entities[id];
          return { entities, agentOrder: state.agentOrder.filter((each) => each !== id) };
        }),
      );
    useUiStore.getState().openAgentPage(ids[1], 'activity');
    render(<AgentsStage />);

    remove(ids[1]);
    expect(useUiStore.getState().agentPage?.name).toBe(ids[2]);

    remove(ids[2]);
    expect(useUiStore.getState().agentPage?.name).toBe(ids[0]);
  });

  it('shows a never-saved page for a new agent', async () => {
    useUiStore.getState().openAgentPage(null, 'definition');
    render(<AgentsStage />);

    expect(screen.getByText('New agent')).toBeInTheDocument();
    expect(screen.getAllByText('not saved yet').length).toBeGreaterThan(0);
    expect(await screen.findByRole('textbox', { name: 'name' })).toBeInTheDocument();
  });

  it('goes back to an agent from the list when the page closes', () => {
    seedDemoFleet();
    useUiStore.getState().openAgentPage(null, 'definition');
    render(<AgentsStage />);

    act(() => {
      useUiStore.getState().closeAgentPage();
    });

    expect(screen.queryByText('Pick an agent')).toBeNull();
    expect(useUiStore.getState().agentPage?.name).toEqual(expect.any(String));
  });
});

describe('AgentsStage with no agent (HIVE-211)', () => {
  it('says what an agent is, and New agent opens a blank definition', async () => {
    render(<AgentsStage />);

    expect(screen.getByRole('heading', { name: 'No agents yet' })).toBeInTheDocument();
    expect(document.querySelector('[data-glyph="comb"]')).not.toBeNull();
    expect(screen.getByText(/An agent is a headless Claude that Hive TTY wakes on the ledger or a schedule\./)).toBeInTheDocument();
    expect(screen.queryByText('Pick an agent')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'New agent' }));
    expect(useUiStore.getState().agentPage).toEqual({ name: null, view: 'definition' });
  });
});
