import { Hexagon, MagnifyingGlass } from '@phosphor-icons/react';

import { BroodEgg } from '@components/ui/brood-egg';
import { Button } from '@components/ui/button';
import { usePickerActions, usePrPageActions } from '@stores/ui-store';

/**
 * The empty Hatchery (HIVE-205, D15): no PR open or in draft, so no panel and
 * the stage is a dormant egg on the creep (`BroodEgg`, HIVE-221).
 */
export function EmptyHatchery() {
  const { setPrSearchOpen } = usePrPageActions();
  const { openPicker } = usePickerActions();

  return (
    <section
      aria-label="Pull requests"
      className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-[radial-gradient(ellipse_at_50%_42%,color-mix(in_srgb,var(--cc-creep)_12%,transparent),transparent_55%)] text-center"
    >
      <BroodEgg className="-mt-10 h-[380px] w-[540px] max-w-full" />
      <h2 className="mt-1.5 text-[20px] text-ink">The Hatchery is quiet</h2>
      <p className="mb-3 text-ui leading-[1.6] text-muted">
        No pull request is open or in draft.
        <br />
        The next one hatches here when a session or the builder opens it.
      </p>
      <div className="flex justify-center gap-1.5">
        <Button className="inline-flex items-center gap-1.5" onClick={() => setPrSearchOpen(true)}>
          <MagnifyingGlass size={13} aria-hidden />
          Search older PRs
        </Button>
        <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={() => openPicker()}>
          <Hexagon size={13} aria-hidden />
          New session
        </Button>
      </div>
    </section>
  );
}
