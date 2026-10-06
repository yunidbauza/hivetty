import { ArrowClockwise } from '@phosphor-icons/react';

/** The way back from a source that failed: one button, one word, no menu. */
export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-micro text-ink hover:bg-hover hover:text-ink"
    >
      <ArrowClockwise size={11} />
      Try again
    </button>
  );
}

/**
 * A source that failed or went stale: the sentence, and the way back.
 *
 * Shared by the PR and WORK rails, which ask the same question of different
 * services — the sentence names which one, and everything else about the shape
 * is the same. Amber rather than red: in the stale case the panel still has
 * rows to show, and they are merely old.
 */
export function SourceProblem({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-1 pb-1">
      <p className="text-ui-sm leading-[1.45] text-amber-text">{message}</p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}
