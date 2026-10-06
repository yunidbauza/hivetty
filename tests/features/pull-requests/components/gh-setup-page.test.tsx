import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GhSetupPage } from '@features/pull-requests/components/gh-setup-page';
import { resetProjectConfig } from '@lib/project-config';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet, seedDemoProjectConfig } from '@tests/support/demo-fleet';

describe('GhSetupPage (HIVE-211)', () => {
  const refreshPrs = vi.fn().mockResolvedValue(undefined);
  const spawnTerminal = vi.fn().mockReturnValue('t-1');

  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    refreshPrs.mockClear();
    spawnTerminal.mockClear();
    useHiveStore.setState({ refreshPrs, spawnTerminal });
  });
  afterEach(() => resetProjectConfig());

  it('signed out: the guide’s advice, the command, Settings, and Check again', async () => {
    useHiveStore.setState({
      prSource: { kind: 'unconfigured', message: 'gh is not logged in', reason: 'unauthenticated' },
    });
    render(<GhSetupPage />);
    expect(screen.getByRole('heading', { name: "The GitHub CLI isn't signed in" })).toBeInTheDocument();
    expect(screen.getByText(/PRs come from/)).toHaveTextContent(
      'PRs come from gh, run as you. Hive TTY stores no GitHub token.',
    );
    expect(screen.getByText('gh auth login').tagName).toBe('CODE');
    expect(screen.getByText(/Settings › Integrations › Command line shows which/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(refreshPrs).toHaveBeenCalled();
  });

  it.each([
    ['not-installed', "The GitHub CLI isn't installed"],
    ['no-repos', 'No GitHub project yet'],
    [null, "Pull requests aren't available here"],
  ] as const)('%s uses main’s sentence', (reason, title) => {
    useHiveStore.setState({ prSource: { kind: 'unconfigured', message: 'main says so', reason } });
    render(<GhSetupPage />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText('main says so')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('Open a terminal opens a plain terminal in the first project with nothing on stage (D3)', async () => {
    seedDemoProjectConfig();
    useHiveStore.setState({
      prSource: { kind: 'unconfigured', message: 'm', reason: 'unauthenticated' },
      spawnTerminal,
    });
    render(<GhSetupPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open a terminal' }));
    expect(spawnTerminal).toHaveBeenCalledWith('nova-web');
  });

  it('Open a terminal prefers the project of the session on stage (D3)', async () => {
    seedDemoProjectConfig();
    const fleet = seedDemoFleet();
    useHiveStore.setState({
      prSource: { kind: 'unconfigured', message: 'm', reason: 'unauthenticated' },
      spawnTerminal,
    });
    const session = Object.values(fleet.entities).find(
      (entity) => entity.kind === 'session' && entity.project !== 'nova-web',
    );
    if (session === undefined || session.kind !== 'session') throw new Error('the demo fleet has sessions');
    useUiStore.setState({ activeTab: session.id });
    render(<GhSetupPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open a terminal' }));
    expect(spawnTerminal).toHaveBeenCalledWith(session.project);
  });

  it('has no Open a terminal with no project, or in the browser', () => {
    useHiveStore.setState({ prSource: { kind: 'unconfigured', message: 'm', reason: 'unauthenticated' } });
    const { unmount } = render(<GhSetupPage />);
    expect(screen.queryByRole('button', { name: 'Open a terminal' })).toBeNull();
    unmount();

    seedDemoProjectConfig();
    useHiveStore.setState({ prSource: { kind: 'unconfigured', message: 'm', reason: null } });
    render(<GhSetupPage />);
    expect(screen.queryByRole('button', { name: 'Open a terminal' })).toBeNull();
  });

  it('a failed first sweep shows the error and Retry', async () => {
    useHiveStore.setState({ prSource: { kind: 'failed', message: 'gh timed out' } });
    render(<GhSetupPage />);
    expect(screen.getByRole('heading', { name: "Couldn't read GitHub" })).toBeInTheDocument();
    expect(document.querySelector('[data-glyph="comb"]')).not.toBeNull();
    expect(screen.getByText('gh timed out')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refreshPrs).toHaveBeenCalled();
  });

  it('draws nothing while loading or live', () => {
    const { container } = render(<GhSetupPage />);
    expect(container).toBeEmptyDOMElement();
  });
});
