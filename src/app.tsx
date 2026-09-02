import { AppShell } from '@components/layout/app-shell';
import { TooltipProvider } from '@components/ui/tooltip';

/**
 * Composition root.
 *
 * Everything the user sees lives under `<AppShell />` (story 020). This stays a
 * one-liner on purpose: providers belong here when they arrive, layout does
 * not.
 *
 * `TooltipProvider` is the one provider so far. Its own default `delayDuration`
 * is `0`, which fires on incidental mouse transit across a strip of 44px icon
 * buttons; `300` is passed here, at the mount site, rather than changed on the
 * component, so `Tooltip` itself stays a faithful, undivergent vendor copy.
 */
export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
    </TooltipProvider>
  );
}
