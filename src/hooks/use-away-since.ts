import { useEffect } from 'react';

import { useMarkAway } from '@stores/ui-store';

/**
 * Home's "since" (HIVE-200): the moment this window last lost focus. Per
 * window, so a server-mode client keeps its own. Mounted once, at the root.
 */
export function useAwayTracker(): void {
  const markAway = useMarkAway();
  useEffect(() => {
    const onBlur = () => markAway(Date.now());
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [markAway]);
}
