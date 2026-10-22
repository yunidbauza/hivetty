import { ArrowClockwise } from '@phosphor-icons/react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/** Long enough that a retry failing at once still reads as having tried. */
const MIN_SPIN_MS = 400;

/**
 * The way back from a source that failed: one button, one word, no menu.
 *
 * Spins until the retry settles, so a click is seen to have done something.
 * Disabled meanwhile; the store already joins a second call to the sweep in
 * flight, this just stops the button inviting one. Reduced motion needs no
 * check here: `global.css` stops the spin, and the label still changes.
 */
export function RetryButton({ onRetry }: { onRetry: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  const retry = () => {
    setPending(true);
    const minSpin = new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS));
    void Promise.allSettled([onRetry(), minSpin]).then(() => setPending(false));
  };

  return (
    <button
      type="button"
      onClick={retry}
      disabled={pending}
      aria-busy={pending}
      className="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-micro text-ink hover:bg-hover hover:text-ink"
    >
      <ArrowClockwise size={11} className={cn(pending && 'animate-spin')} />
      {pending ? 'Trying…' : 'Try again'}
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
  onRetry: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-1 pb-1">
      <p className="text-ui-sm leading-[1.45] text-amber-text">{message}</p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}
