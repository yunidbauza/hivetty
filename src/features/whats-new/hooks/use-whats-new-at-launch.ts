import { useEffect, useState } from 'react';


import { majorMinor, whatsNewFor } from '@features/whats-new/releases';
import { useProjectConfig } from '@hooks/use-project-config';
import { readAppInfo } from '@lib/project-config';
import type { AppInfo } from '@shared/ipc-contract';
import { useWhatsNewPrefs } from '@stores/appearance-store';
import { useOverlayOpen, useSetWhatsNewOpen } from '@stores/ui-store';

/** How long after the window has painted the card waits before it opens. */
export const WHATS_NEW_DELAY_MS = 800;

/**
 * Decides, once per launch, whether What's new opens (1.0), and answers the
 * running version for the card to pick its entry by.
 *
 * It waits for the app's info and the config. A launch without the splash (the
 * Playwright suite) never shows it. A fresh install records its version as seen
 * and shows nothing: the first-run page is its tour. Otherwise
 * {@link whatsNewFor} answers, and a due card opens {@link WHATS_NEW_DELAY_MS}
 * after the window paints, and not while the picker or Settings is up.
 */
export function useWhatsNewAtLaunch(): string | null {
  const config = useProjectConfig();
  const { seen, off, setSeen } = useWhatsNewPrefs();
  const overlay = useOverlayOpen();
  const setOpen = useSetWhatsNewOpen();
  const [info, setInfo] = useState<AppInfo | null | undefined>(undefined);
  const [decided, setDecided] = useState(false);
  const [due, setDue] = useState(false);

  useEffect(() => {
    let live = true;
    void readAppInfo().then((next) => {
      if (live) setInfo(next);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (decided || info === undefined || config === null) return;
    setDecided(true);
    if (info === null || info.splash === false) return;
    if (config.templateWritten) {
      setSeen(majorMinor(info.version));
      return;
    }
    setDue(whatsNewFor(info.version, { seen, off, fresh: false }) !== null);
  }, [decided, info, config, seen, off, setSeen]);

  useEffect(() => {
    if (!due || overlay) return;
    const timer = setTimeout(() => {
      setDue(false);
      setOpen(true);
    }, WHATS_NEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, overlay, setOpen]);

  return info?.version ?? null;
}
