import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRepo } from '@shared/github-contract';

import { RepoPicker } from '@features/settings/components/repo-picker';
import { escapeIsClaimed } from '@features/settings/components/settings-overlay';
import { useUserRepos, type UserReposStatus } from '@features/settings/hooks/use-user-repos';

vi.mock('@features/settings/hooks/use-user-repos', () => ({ useUserRepos: vi.fn() }));

const hook = vi.mocked(useUserRepos);
const retry = vi.fn();

const repo = (name: string, over: Partial<UserRepo> = {}): UserRepo => ({
  owner: 'acme',
  name,
  url: `https://github.com/acme/${name}.git`,
  isPrivate: false,
  isFork: false,
  isArchived: false,
  pushedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  isProject: false,
  ...over,
});

function given(status: UserReposStatus): void {
  hook.mockReturnValue({ status, retry });
}

/** A controlled parent, the way the clone view holds the URL. */
function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <RepoPicker value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const field = (): HTMLElement => screen.getByLabelText(/repository url/i);

beforeEach(() => {
  retry.mockReset();
  given({
    state: 'ready',
    snapshot: {
      repos: [
        repo('nova-web'),
        repo('hive-team', { isProject: true, isPrivate: true }),
        repo('old', { isFork: true, isArchived: true }),
      ],
      total: 3,
    },
  });
});

describe('RepoPicker', () => {
  it('keeps the field labelled Repository URL, and shows no list until focused', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('id', 'clone-url');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('lists recent repositories on focus with their tags and age', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());

    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('3 repositories')).toBeInTheDocument();
    const team = screen.getByRole('option', { name: /hive-team/ });
    expect(team).toHaveTextContent('already a project');
    expect(team).toHaveTextContent('private');
    expect(screen.getByRole('option', { name: /old/ })).toHaveTextContent(/fork.*archived/);
    expect(team).toHaveTextContent('2 days ago');
  });

  it('filters as the user types', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'hive');

    expect(screen.getByText('Matching')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('fills the field with the https URL on click and closes the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.click(screen.getByRole('option', { name: /nova-web/ }));

    expect(screen.getByTestId('value')).toHaveTextContent('https://github.com/acme/nova-web.git');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field()).toHaveFocus();
  });

  it('gets out of the way for a URL', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'git@gitlab.com:team/service.git');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says Top 10 of N, using the account total for an empty query', async () => {
    given({
      state: 'ready',
      snapshot: { repos: Array.from({ length: 12 }, (_, i) => repo(`r-${i}`)), total: 240 },
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());

    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(screen.getByText('Top 10 of 240 · keep typing to narrow')).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'zzz');
    expect(screen.getByText(/None of your repositories match "zzz"/)).toBeInTheDocument();
  });

  it('says when the account has no repositories', async () => {
    given({ state: 'ready', snapshot: { repos: [], total: 0 } });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    expect(screen.getByText('No repositories on this GitHub account.')).toBeInTheDocument();
  });

  it('shows loading', async () => {
    given({ state: 'loading' });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    expect(screen.getByText('Loading your repositories…')).toBeInTheDocument();
  });

  it('shows the error and retries without losing focus', async () => {
    given({
      state: 'failed',
      error: {
        kind: 'unauthenticated',
        message: 'GitHub CLI (`gh`) is not logged in — run `gh auth login`.',
      },
    });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());

    expect(screen.getByText(/gh auth login/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(field()).toHaveFocus();
  });

  it('shows nothing at all when unavailable, and the field still types', async () => {
    given({ state: 'unavailable' });
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), 'anything');
    // Not a /repositor/ text query: the label "Repository URL" would match it.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('Loading your repositories…')).toBeNull();
    expect(screen.queryByText(/None of your repositories/)).toBeNull();
    expect(screen.getByTestId('value')).toHaveTextContent('anything');
  });
});

describe('RepoPicker keyboard', () => {
  const options = (): HTMLElement[] => screen.getAllByRole('option');

  it('marks the first row active and moves with the arrows, wrapping', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());

    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(field()).toHaveAttribute('aria-activedescendant', options()[0].id);

    await user.keyboard('{ArrowDown}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    expect(options()[0]).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(options()[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('picks the active row with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByTestId('value')).toHaveTextContent('https://github.com/acme/hive-team.git');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('resets to the first row when the query changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.keyboard('{ArrowDown}');
    await user.type(field(), 'o');

    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('claims Escape while open, so settings stays open, and closes the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());

    expect(escapeIsClaimed(field())).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(escapeIsClaimed(field())).toBe(false);
  });

  it('reopens on ArrowDown after Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.keyboard('{Escape}{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
