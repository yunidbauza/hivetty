import { Check, Minus, X } from '@phosphor-icons/react';

import type { JobState } from '@/lib/checks-graph';
import { cn } from '@/lib/utils';

/** A job's or a step's state as an icon: pr-properties' CheckIcon, by JobState (HIVE-206). */
export function StateIcon({ state }: { state: JobState }) {
  if (state === 'passed') return <Check size={14} aria-hidden data-icon="passed" className="shrink-0 text-green" />;
  if (state === 'failed') return <X size={14} aria-hidden data-icon="failed" className="shrink-0 text-red" />;
  if (state === 'skipped') return <Minus size={14} aria-hidden data-icon="skipped" className="shrink-0 text-subtle" />;
  return (
    <span
      aria-hidden
      data-icon={state}
      className={cn(
        'mx-px size-3 shrink-0 rounded-full border-2',
        state === 'running' ? 'border-green motion-safe:animate-ccpulse' : 'border-dashed border-subtle',
      )}
    />
  );
}
