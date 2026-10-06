import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JiraSetupPage } from '@features/work/components/jira-setup-page';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

describe('JiraSetupPage (HIVE-211)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('says Jira is not connected and Connect opens Settings › Integrations', async () => {
    useHiveStore.setState({ ticketSource: { kind: 'unconfigured' } });
    render(<JiraSetupPage />);
    expect(screen.getByRole('heading', { name: "Jira isn't connected" })).toBeInTheDocument();
    expect(document.querySelector('[data-glyph="comb"]')).not.toBeNull();
    expect(
      screen.getByText(
        'Work lists your Jira tickets. Add your site and an API token, and the list fills on the next sweep.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect Jira' }));
    expect(useUiStore.getState()).toMatchObject({ settings: true, settingsSection: 'integrations' });
  });

  it('Learn what Hive TTY reads opens the same pane (D3)', async () => {
    useHiveStore.setState({ ticketSource: { kind: 'unconfigured' } });
    render(<JiraSetupPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Learn what Hive TTY reads' }));
    expect(useUiStore.getState()).toMatchObject({ settings: true, settingsSection: 'integrations' });
  });

  it('a failed first read shows the error and Retry refreshes', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    useHiveStore.setState({ ticketSource: { kind: 'failed', message: 'Jira said 401' }, refreshTickets: refresh });
    render(<JiraSetupPage />);
    expect(screen.getByRole('heading', { name: "Couldn't read Jira" })).toBeInTheDocument();
    expect(screen.getByText('Jira said 401')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Learn what Hive TTY reads' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('live and empty says there is nothing assigned', () => {
    useHiveStore.setState({ ticketSource: { kind: 'live', stale: false, capped: false }, tickets: [] });
    render(<JiraSetupPage />);
    expect(screen.getByRole('heading', { name: 'No tickets for you' })).toBeInTheDocument();
    expect(screen.getByText(/Work lists the Jira tickets assigned to you that are not done\./)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    // Empty, not unwired: the plain Kanban glyph stays.
    expect(document.querySelector('[data-glyph="comb"]')).toBeNull();
  });
});
