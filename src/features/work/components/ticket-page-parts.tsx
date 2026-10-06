import { SkeletonBar } from '@features/shared/components/skeleton-bar';

/** `HH:MM`, the age a section shows beside a failed re-read. */
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * A section's failed read, drawn in that section's place (HIVE-203).
 *
 * With content already on screen the content stays and this says how old it
 * is, so a Jira outage reads as "possibly out of date" rather than as nothing.
 */
export function TicketProblem({
  message,
  onRetry,
  readAt,
}: {
  message: string;
  onRetry: () => void;
  /** When the section last read; omitted when nothing was ever shown. */
  readAt?: number;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-2 text-control">
      <span className="text-amber-text">{message}</span>
      <button type="button" onClick={onRetry} className="text-brand hover:underline">
        Retry
      </button>
      {readAt === undefined ? null : <span className="text-subtle">as of {clock(readAt)}</span>}
    </p>
  );
}

/** Three ragged bars in the shape of the text they stand for. */
export function LinesSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className="flex animate-pulse flex-col gap-2 py-1">
      <SkeletonBar className="w-[92%]" />
      <SkeletonBar className="w-[84%]" />
      <SkeletonBar className="w-[58%]" />
    </div>
  );
}
