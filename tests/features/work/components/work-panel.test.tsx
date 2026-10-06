import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkPanel } from '@features/work/components/work-panel';
import { useHiveStore, type TicketSearchState } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

describe('WorkPanel', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    /**
     * Stub the mount-time read.
     *
     * The panel refreshes when it mounts, and the real action settles on
     * `unconfigured` in a test environment — no bridge, therefore no Jira —
     * which would wipe the seeded tickets before a single assertion ran. These
     * cases are about how a ticket *renders*, not where it came from;
     * `work-panel.states.test.tsx` owns the source states.
     */
    useHiveStore.setState({
      refreshTickets: () => Promise.resolve(),
      // The panel now shares the PR poller with the PRS tab, and the real sweep
      // settles on `unconfigured` here — which would clear the seeded PRs the
      // ticket cards resolve against.
      refreshPrs: () => Promise.resolve(),
    });
    useUiStore.getState().reset();
  });

  /**
   * A ticket naming a session that does not exist used to be the defensive case
   * here, and HIVE-73 made it unrepresentable: the link points the other way
   * now, so a card lists sessions the store *has* rather than ids it was told
   * about. The surviving question is the inverse — a ticket nothing is working
   * shows no session rows and still renders.
   */
  it('renders a ticket no session is working, without throwing', () => {
    act(() => {
      useHiveStore.setState({
        tickets: [
          {
            key: 'GHOST-1',
            status: 'To Do',
            statusCategory: 'todo',
            title: 'Nobody is working this one',
            priority: null,
            assignee: null,
          },
        ],
      });
    });

    render(<WorkPanel />);

    expect(screen.getByText('Nobody is working this one')).toBeInTheDocument();
    // The demo fleet is seeded, so this proves the card filters by ticket
    // rather than simply having no sessions to show.
    expect(screen.queryByText('hero-refresh')).not.toBeInTheDocument();
  });

});

/**
 * A search takes the panel over completely, the way the PRs panel's does.
 *
 * The standing list and the results are two different answers, and showing them
 * at once would mean a panel claiming both "here is your work" and "here is
 * everyone's" in one column.
 */
describe('WorkPanel — searching', () => {
  const found = (key: string) => ({
    key,
    status: 'In Progress',
    statusCategory: 'in-progress' as const,
    title: `about ${key}`,
    priority: null,
    assignee: null,
    url: `https://example.invalid/${key}`,
  });

  /** A search slice, with the fields a case does not care about defaulted. */
  const searchState = (
    partial: Partial<TicketSearchState>,
  ): TicketSearchState => ({
    term: 'rails',
    results: null,
    searching: false,
    error: null,
    capped: false,
    tooShort: false,
    ...partial,
  });

  beforeEach(() => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    useHiveStore.setState({
      refreshTickets: () => Promise.resolve(),
      refreshPrs: () => Promise.resolve(),
      searchTickets: () => Promise.resolve(),
    });
    useUiStore.getState().reset();
  });

  it('carries a search box above the list', () => {
    render(<WorkPanel />);

    expect(screen.getByLabelText('Search tickets')).toBeInTheDocument();
  });

  it('replaces the standing list with what the search found', () => {
    useUiStore.getState().setWorkSearchTerm('filing');
    useHiveStore.setState({
      ticketSearch: searchState({
        term: 'filing',
        results: [found('INCORP-505')],
        searching: false,
        error: null,
      }),
    });

    render(<WorkPanel />);

    expect(screen.getByText('INCORP-505')).toBeInTheDocument();
    // The seeded ticket the panel would otherwise be showing.
    expect(screen.queryByText('GRAC-3018')).not.toBeInTheDocument();
  });

  it('keeps the box on screen while the first answer is out', () => {
    useUiStore.getState().setWorkSearchTerm('filing');
    useHiveStore.setState({
      ticketSearch: searchState({
        term: 'filing',
        results: null,
        searching: true,
        error: null,
      }),
    });

    render(<WorkPanel />);

    // The box is what the user is typing into. Replacing the whole panel with a
    // skeleton would take it away mid-word.
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toBeInTheDocument();
    expect(screen.queryByText('GRAC-3018')).not.toBeInTheDocument();
  });

  it('says a search matched nothing rather than sitting blank', () => {
    useUiStore.getState().setWorkSearchTerm('zzzz');
    useHiveStore.setState({
      ticketSearch: searchState({
        term: 'zzzz',
        results: [],
        searching: false,
        error: null,
      }),
    });

    render(<WorkPanel />);

    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('does not explain an answer to a question it never asked', () => {
    useUiStore.getState().setWorkSearchTerm('a');
    useHiveStore.setState({
      ticketSearch: searchState({
        term: 'a',
        results: null,
        searching: false,
        error: null,
        capped: false,
        tooShort: true,
      }),
    });

    render(<WorkPanel />);

    // A term too short to send is not a search that found nothing, so
    // "Nothing matches “a”" claims Jira answered when it was never asked.
    expect(screen.queryByText(/Nothing matches/)).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    // And the skeleton is the same untruth in the other direction: it says an
    // answer is on its way when no request was ever made, so it pulses forever.
    expect(screen.queryAllByTestId('work-skeleton-card')).toHaveLength(0);
  });

  it('prints Jira’s refusal instead of an empty result', () => {
    useUiStore.getState().setWorkSearchTerm('rails');
    useHiveStore.setState({
      ticketSearch: searchState({
        term: 'rails',
        results: [],
        searching: false,
        error: 'Jira refused the query.',
      }),
    });

    render(<WorkPanel />);

    expect(screen.getByText('Jira refused the query.')).toBeInTheDocument();
    // "Nothing matches" would be a different, wrong explanation of the same
    // empty column.
    expect(screen.queryByText(/Nothing matches/)).not.toBeInTheDocument();
  });

  it('shows none of the standing list’s notices while searching', () => {
    useUiStore.getState().setWorkSearchTerm('rails');
    useHiveStore.setState({
      ticketSource: { kind: 'unconfigured' },
      ticketSearch: searchState({ results: [found('HIVE-1')] }),
    });

    render(<WorkPanel />);

    // Those notices describe the configured query, and a search is not it.
    expect(screen.queryByText(/No Jira connection yet/)).not.toBeInTheDocument();
  });
});
