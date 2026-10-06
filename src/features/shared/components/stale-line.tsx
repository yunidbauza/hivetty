import { RetryButton } from '@features/shared/components/source-problem';
import { clockTime } from '@lib/format-clock';

/**
 * A live list that could not be refreshed (HIVE-211): when the source failed,
 * and when the rows on screen were read. Clock times, not ages — "10:42" stays
 * true while the user reads it. An amber wash: the rows are old, not wrong.
 *
 * Either time missing (only an older state shape) falls back to the sentence
 * the panels used before.
 */
export function StaleLine({
  service,
  failedAt,
  readAt,
  onRetry,
}: {
  service: string;
  failedAt: number | undefined;
  readAt: number | null;
  onRetry: () => void;
}) {
  const message =
    failedAt === undefined || readAt === null
      ? `Could not reach ${service}. These may be out of date.`
      : `Couldn't reach ${service} at ${clockTime(failedAt)}. Showing what was loaded at ${clockTime(readAt)}.`;

  return (
    <div
      role="status"
      className="mb-1 flex flex-col items-start gap-1 rounded-md bg-amber-soft px-2 py-1.5"
    >
      <p className="text-ui-sm leading-[1.45] text-amber-text">{message}</p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}
