import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TicketWorkflowGroup } from '@features/settings/components/ticket-workflow-group';

const setJiraConnection = vi.fn((_request: unknown) => Promise.resolve());
const agents = vi.hoisted(() => ({ names: ['builder', 'shipper'] }));

vi.mock('@lib/project-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/project-config')>()),
  setJiraConnection: (request: unknown) => setJiraConnection(request),
}));
vi.mock('@hooks/use-skills', () => ({
  useSkills: () => ({ skills: [{ name: 'work-on' }, { name: 'debug' }], invalid: [], skillsRoot: '' }),
}));
vi.mock('@hooks/use-agents', () => ({
  useAgents: () => ({ agents: agents.names.map((name) => ({ name })), agentsRoot: '' }),
}));

const preview = () => screen.getByTestId('ticket-workflow-preview').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  agents.names = ['builder', 'shipper'];
});

describe('TicketWorkflowGroup', () => {
  it('starts at Just open, saying nothing will be typed', () => {
    render(<TicketWorkflowGroup workflow={null} />);
    expect(screen.getByRole('radio', { name: 'Just open' })).toHaveAttribute('aria-checked', 'true');
    expect(preview()).toBe('Nothing: the session opens at an empty prompt.');
  });

  it('Run a skill saves hive:work-on at once, and the preview shows the first message', async () => {
    render(<TicketWorkflowGroup workflow={null} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Run a skill' }));
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'skill', skill: 'hive:work-on' } });
    expect(preview()).toBe('/hive:work-on PROJ-123');
  });

  it('lists the skills by their session names, and saves a pick', async () => {
    render(<TicketWorkflowGroup workflow={{ kind: 'skill', skill: 'hive:work-on' }} />);
    await userEvent.selectOptions(screen.getByLabelText('Skill'), 'hive:debug');
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'skill', skill: 'hive:debug' } });
  });

  it('saves the extra prompt on Enter, filled in the preview', async () => {
    render(<TicketWorkflowGroup workflow={{ kind: 'skill', skill: 'hive:work-on' }} />);
    const field = screen.getByLabelText('Extra prompt (optional)');
    await userEvent.type(field, 'keep {{key} small{Enter}');
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'skill', skill: 'hive:work-on', prompt: 'keep {key} small' } });
    expect(preview()).toBe('/hive:work-on PROJ-123 keep PROJ-123 small');
  });

  it('takes a typed skill from another plugin, and refuses one that is not a skill name', async () => {
    render(<TicketWorkflowGroup workflow={{ kind: 'skill', skill: 'hive:work-on' }} />);
    await userEvent.selectOptions(screen.getByLabelText('Skill'), '__typed');
    const name = screen.getByLabelText('Skill name');
    await userEvent.type(name, 'workstream:work-on{Enter}');
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'skill', skill: 'workstream:work-on' } });

    setJiraConnection.mockClear();
    await userEvent.clear(name);
    await userEvent.type(name, 'two words{Enter}');
    expect(setJiraConnection).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved: skill');
  });

  it('opens a saved skill from another plugin on the typed field', () => {
    render(<TicketWorkflowGroup workflow={{ kind: 'skill', skill: 'workstream:work-on' }} />);
    expect(screen.getByLabelText('Skill name')).toHaveValue('workstream:work-on');
  });

  it('hands to an agent: the session asks it by default, or it wakes instead', async () => {
    render(<TicketWorkflowGroup workflow={null} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Hand to an agent' }));
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'agent', agent: 'builder', via: 'session' } });
    expect(preview()).toContain('call ledger_ask with to "builder"');

    await userEvent.click(screen.getByRole('radio', { name: 'Instead of a session' }));
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'agent', agent: 'builder', via: 'wake' } });
    expect(preview()).toBe(
      'Wakes builder: Work PROJ-123: Example ticket. https://example.atlassian.net/browse/PROJ-123',
    );

    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'shipper' } });
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'agent', agent: 'shipper', via: 'wake' } });
  });

  it('hands to the first agent when the agents arrive after the group mounted', async () => {
    agents.names = [];
    const { rerender } = render(<TicketWorkflowGroup workflow={null} />);
    agents.names = ['builder', 'shipper'];
    rerender(<TicketWorkflowGroup workflow={null} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Hand to an agent' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: { kind: 'agent', agent: 'builder', via: 'session' } });
  });

  it('cannot hand to an agent when there is none', () => {
    agents.names = [];
    render(<TicketWorkflowGroup workflow={null} />);
    expect(screen.getByRole('radio', { name: 'Hand to an agent' })).toBeDisabled();
  });

  it('Just open saves null, which takes the workflow out of the file', async () => {
    render(<TicketWorkflowGroup workflow={{ kind: 'skill', skill: 'hive:debug' }} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Just open' }));
    expect(setJiraConnection).toHaveBeenLastCalledWith({ workflow: null });
  });
});
