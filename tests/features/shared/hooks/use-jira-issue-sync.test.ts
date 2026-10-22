import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useJiraIssueSync } from '@features/shared/hooks/use-jira-issue-sync';
import { useHiveStore, useNextTransition, useOpenTicket } from '@stores/hive-store';

import type { JiraIssue, JiraTransition } from '@shared/jira-contract';

const readJiraTransitions = vi.fn();

vi.mock('@/lib/jira', () => ({
  readJiraStatus: () => Promise.resolve(null),
  searchJiraIssues: () => Promise.resolve(null),
  readJiraTransitions: (request: unknown) => readJiraTransitions(request),
}));

const toInProgress: JiraTransition = { id: '21', name: 'Start', to: { name: 'In Progress', statusCategory: 'in-progress' } };
const toDone: JiraTransition = { id: '31', name: 'Finish', to: { name: 'Done', statusCategory: 'done' } };
const pushed: JiraIssue = {
  key: 'HIVE-235',
  summary: 'Harness port',
  status: 'In Progress',
  statusCategory: 'in-progress',
  issueType: 'Story',
  priority: null,
  assignee: null,
  updated: '2026-10-21T00:00:00.000-0400',
  url: 'https://behiques.atlassian.net/browse/HIVE-235',
};

describe('useJiraIssueSync (live ticket status)', () => {
  let push: ((issue: JiraIssue) => void) | undefined;
  const stop = vi.fn();

  beforeEach(() => {
    useHiveStore.getState().reset();
    useHiveStore.setState({
      tickets: [{ key: 'HIVE-235', status: 'To Do', statusCategory: 'todo', title: 'Harness port', priority: null, assignee: null }],
      ticketDetails: { 'HIVE-235': { key: 'HIVE-235', transitions: [toInProgress], problems: {} } },
    });
    readJiraTransitions.mockResolvedValue({ ok: true, value: [toDone] });
    (window as { hive?: unknown }).hive = {
      jira: {
        onIssueChanged: vi.fn((callback: (issue: JiraIssue) => void) => {
          push = callback;
          return stop;
        }),
      },
    };
  });

  afterEach(() => {
    delete (window as { hive?: unknown }).hive;
    push = undefined;
  });

  it('does nothing on the browser target, where there is no bridge', () => {
    delete (window as { hive?: unknown }).hive;
    expect(() => renderHook(() => useJiraIssueSync())).not.toThrow();
  });

  it('a pushed issue moves the status and "Move to" together, and unmounting unsubscribes', async () => {
    const { unmount } = renderHook(() => useJiraIssueSync());
    const shown = renderHook(() => [useOpenTicket('HIVE-235')?.status, useNextTransition('HIVE-235')?.to.name]);
    expect(shown.result.current).toEqual(['To Do', 'In Progress']);

    push?.(pushed);
    await vi.waitFor(() => {
      shown.rerender();
      expect(shown.result.current).toEqual(['In Progress', 'Done']);
    });

    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
