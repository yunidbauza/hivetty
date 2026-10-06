import { SkeletonBar } from '@features/shared/components/skeleton-bar';

/** One placeholder in `PrRow`'s shape. No button: e2e counts buttons as PRs. */
function SkeletonRow({ titleWidth }: { titleWidth: string }) {
  return (
    <div aria-hidden data-testid="prs-skeleton-row" className="flex animate-pulse gap-2.5 px-2 py-[9px]">
      <SkeletonBar className="size-4 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-[7px]">
        <div className="flex items-center gap-2.5">
          <SkeletonBar className="w-9" />
          <SkeletonBar className="w-20" />
          <span className="flex-1" />
          <SkeletonBar className="w-16" />
        </div>
        <SkeletonBar className={titleWidth} />
      </div>
    </div>
  );
}

/** The first sweep, in the rows' shape (HIVE-205). Only while nothing has been read. */
export function PrListSkeleton() {
  return (
    <div data-testid="prs-skeleton" role="status" aria-label="Loading pull requests" className="flex flex-col">
      <SkeletonRow titleWidth="w-[78%]" />
      <SkeletonRow titleWidth="w-[64%]" />
      <SkeletonRow titleWidth="w-[70%]" />
    </div>
  );
}
