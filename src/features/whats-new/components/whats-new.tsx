import { WhatsNewDialog } from '@features/whats-new/components/whats-new-dialog';
import { useWhatsNewAtLaunch } from '@features/whats-new/hooks/use-whats-new-at-launch';
import { latestWhatsNew, majorMinor, RELEASES } from '@features/whats-new/releases';
import { useWhatsNewPrefs } from '@stores/appearance-store';
import { useSetWhatsNewOpen, useWhatsNewOpen } from '@stores/ui-store';

/**
 * What's new (1.0), mounted once by the shell: opens itself at launch for a
 * release that has an entry, or when Settings asks. The running version's
 * entry when there is one, else the newest. Closing it any way records the
 * running version's own entry as seen, so a preview of a newer entry from an
 * older build leaves the launch card due; the box also turns future ones off.
 */
export function WhatsNew() {
  const version = useWhatsNewAtLaunch();
  const open = useWhatsNewOpen();
  const setOpen = useSetWhatsNewOpen();
  const { setSeen, setOff } = useWhatsNewPrefs();

  if (!open) return null;
  const own = version === null ? undefined : RELEASES.find((r) => r.version === majorMinor(version));
  const entry = own ?? latestWhatsNew();

  return (
    <WhatsNewDialog
      entry={entry}
      onClose={(optOut) => {
        if (own !== undefined) setSeen(own.version);
        if (optOut) setOff(true);
        setOpen(false);
      }}
    />
  );
}
