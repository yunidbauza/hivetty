import { useEffect } from 'react';

import { useSetTicketDetailIssue, useUpdateTicket } from '@stores/hive-store';

/**
 * Install every issue main reports moved (`jira:issue-changed`): an agent's
 * or a session's `jira_transition`, or "Move to" in any window. Both homes a
 * ticket has take it, and each re-reads the transitions when the status
 * moved, so the status and "Move to" change together wherever they show.
 *
 * Mounted once, at the composition root, for the reason `useLedgerSync` is.
 * On the browser target there is no bridge and this does nothing.
 */
export function useJiraIssueSync(): void {
  const updateTicket = useUpdateTicket();
  const setIssue = useSetTicketDetailIssue();

  useEffect(
    () =>
      window.hive?.jira.onIssueChanged((issue) => {
        updateTicket(issue);
        setIssue(issue);
      }),
    [updateTicket, setIssue],
  );
}
