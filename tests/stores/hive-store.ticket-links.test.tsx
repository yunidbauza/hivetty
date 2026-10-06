import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEpicLabel, useHiveStore, useLatestComment, useTicketCriteria, useTicketLinks } from '@stores/hive-store';
import type { JiraLink } from '@shared/jira-contract';

/** The Ticket tab's selectors (HIVE-202): derived from the keyed entry, never stored. */

const blocker: JiraLink = {
  kind: 'issue',
  title: 'A-1',
  url: 'u',
  key: 'A-1',
  summary: 's',
  status: 'To Do',
  statusCategory: 'todo',
  linkType: 'Blocks',
  direction: 'inward',
};

beforeEach(() => {
  useHiveStore.getState().reset();
});

describe('Ticket tab selectors (HIVE-202)', () => {
  it('undefined / null before anything is read', () => {
    expect(renderHook(() => useTicketLinks('HIVE-7')).result.current).toBeUndefined();
    expect(renderHook(() => useTicketCriteria('HIVE-7')).result.current).toBeNull();
    expect(renderHook(() => useLatestComment('HIVE-7')).result.current).toBeUndefined();
    expect(renderHook(() => useEpicLabel('HIVE-7')).result.current).toBeNull();
  });

  it('derive from the entry, never stored', () => {
    useHiveStore.setState({
      ticketDetails: {
        'HIVE-7': {
          key: 'HIVE-7',
          links: [blocker],
          detail: {
            description: [
              { kind: 'heading', runs: [{ text: 'Acceptance', marks: [] }], level: 2 },
              { kind: 'bullet', runs: [{ text: 'works', marks: [] }], depth: 0 },
            ],
            parent: { key: 'HIVE-161', summary: 'Workflow', issueType: 'Epic' },
          },
          epicProgress: { done: 9, total: 14, capped: false },
          comments: [
            { id: '1', author: 'A', created: '2026-10-01T09:00:00Z', body: [] },
            { id: '2', author: 'Yunid', created: '2026-10-01T09:58:00Z', body: [] },
          ],
          problems: {},
        },
      },
    });
    expect(renderHook(() => useTicketLinks('HIVE-7')).result.current?.verdict.lead).toBe('Blocked by 1 open:');
    expect(renderHook(() => useTicketCriteria('HIVE-7')).result.current).toEqual({
      kind: 'criteria',
      items: [[{ text: 'works', marks: [] }]],
    });
    expect(renderHook(() => useLatestComment('HIVE-7')).result.current?.id).toBe('2');
    expect(renderHook(() => useEpicLabel('HIVE-7')).result.current).toBe('HIVE-161 · Workflow · 9/14');
  });

  it('the links model is the same object across renders while its inputs hold', () => {
    useHiveStore.setState({ ticketDetails: { 'HIVE-7': { key: 'HIVE-7', links: [blocker], problems: {} } } });
    const { result, rerender } = renderHook(() => useTicketLinks('HIVE-7'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
