import { useEffect, useMemo } from 'react';

import { openRowIndex } from '@lib/open-row';
import { useTicketGroups } from '@stores/hive-store';
import { useRememberWorkTicket, useWorkTicket, useWorkTicketAt } from '@stores/ui-store';

/**
 * Which ticket the Work stage shows: the one last shown while the list still
 * holds it, else the one that came after it, else the first (`openRowIndex`).
 * A ticket opened from a search or a link stays until another is picked.
 *
 * What is shown is written back as remembered, so the panel's row highlight
 * follows and a return to Work finds it.
 */
export function useShownTicket(): string | null {
  const { groups } = useTicketGroups();
  const last = useWorkTicket();
  const at = useWorkTicketAt();
  const remember = useRememberWorkTicket();

  const keys = useMemo(() => groups.flatMap((group) => group.rows.map((row) => row.ticket.key)), [groups]);
  const index = openRowIndex(keys, last, at);
  const listed = index !== null && index >= 0 ? keys[index] : undefined;

  useEffect(() => {
    if (listed !== undefined && index !== null) remember(listed, index);
  }, [listed, index, remember]);

  return index === -1 ? last : (listed ?? null);
}
