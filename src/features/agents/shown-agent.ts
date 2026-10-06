import { useEffect, useMemo } from 'react';

import { openRowIndex } from '@lib/open-row';
import { useAgentsByGroup } from '@stores/hive-store';
import { useAgentPage, useAgentPageAt, useRememberAgentPage } from '@stores/ui-store';

/**
 * Which agent the Agents stage shows: the one last shown while the panel still
 * lists it, else the one that came after it, else the first (`openRowIndex`).
 * `null` is a new agent never saved; `undefined` is nothing to show.
 *
 * What is shown is written back as remembered, so the panel's row highlight
 * and the page's Activity | Definition follow it.
 */
export function useShownAgent(): string | null | undefined {
  const groups = useAgentsByGroup();
  const page = useAgentPage();
  const at = useAgentPageAt();
  const remember = useRememberAgentPage();

  const fresh = page !== null && page.name === null;
  const ids = useMemo(() => groups.flatMap((group) => group.ids), [groups]);
  const index = fresh ? null : openRowIndex(ids, page?.name ?? null, at);
  const listed = index !== null && index >= 0 ? ids[index] : undefined;

  useEffect(() => {
    if (listed !== undefined && index !== null) remember(listed, index);
  }, [listed, index, remember]);

  if (fresh) return null;
  return index === -1 ? (page?.name ?? undefined) : listed;
}
