import { Kanban, PlugsConnected } from '@phosphor-icons/react';

import { Button } from '@components/ui/button';
import { CombGlyph } from '@components/ui/comb-glyph';
import { EmptyPlace } from '@components/ui/empty-place';
import { useRefreshTickets, useTicketSource } from '@stores/hive-store';
import { useSettingsActions } from '@stores/ui-store';

/**
 * Work with nothing to list (HIVE-211): not connected, a first read that
 * failed, or nothing assigned. Both setup buttons open Settings › Integrations
 * (D3); the Jira section there is what says what the Hive reads.
 */
export function JiraSetupPage() {
  const source = useTicketSource();
  const refresh = useRefreshTickets();
  const { openSettings } = useSettingsActions();
  const connect = () => openSettings('integrations');

  if (source.kind === 'live') {
    return (
      <EmptyPlace label="Work" glyph={<Kanban size={40} />} title="No tickets for you">
        Work lists the Jira tickets assigned to you that are not done. The next one lands here on the next
        sweep.
      </EmptyPlace>
    );
  }

  const failed = source.kind === 'failed';
  return (
    <EmptyPlace
      label="Work"
      glyph={<CombGlyph icon={PlugsConnected} />}
      title={failed ? "Couldn't read Jira" : "Jira isn't connected"}
      actions={
        <>
          <Button variant="primary" onClick={connect}>
            Connect Jira
          </Button>
          {failed ? (
            <Button onClick={() => void refresh()}>Retry</Button>
          ) : (
            <Button onClick={connect}>Learn what Hive TTY reads</Button>
          )}
        </>
      }
    >
      {failed
        ? source.message
        : 'Work lists your Jira tickets. Add your site and an API token, and the list fills on the next sweep.'}
    </EmptyPlace>
  );
}
