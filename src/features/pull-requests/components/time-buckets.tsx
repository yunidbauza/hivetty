import type { Bucket, BucketName } from '@/lib/pr-timeline';

/** `9m`, `1h 20m`: whole minutes, the Timeline's one duration format. */
export function dur(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  return m < 60 ? `${String(m)}m` : `${String(Math.floor(m / 60))}h ${String(m % 60)}m`;
}

const TONE: Record<BucketName, string> = {
  'Before the shipper': 'bg-[color-mix(in_srgb,var(--cc-chitin)_18%,var(--cc-panel))]',
  'Self review and fix': 'bg-[color-mix(in_srgb,var(--cc-subtle)_25%,var(--cc-panel))]',
  // tint-exempt: a heatmap scale, data-viz
  CI: 'bg-[color-mix(in_srgb,var(--cc-green)_25%,var(--cc-panel))]',
  // tint-exempt: a heatmap scale, data-viz
  Findings: 'bg-[color-mix(in_srgb,var(--cc-green)_16%,var(--cc-panel))]',
  // tint-exempt: a heatmap scale, data-viz
  'Waiting on you': 'bg-[color-mix(in_srgb,var(--cc-amber)_28%,var(--cc-panel))]',
  'Waiting on review': 'bg-[color-mix(in_srgb,var(--cc-subtle)_15%,var(--cc-panel))]',
};

/** "Where the time went" (HIVE-208): the PR's age as one stacked bar, then the sentence. */
export function TimeBuckets({ age, buckets, sentence }: { age: number; buckets: Bucket[]; sentence: string }) {
  return (
    <section aria-labelledby="pr-time-buckets" className="flex flex-col gap-2.5">
      <h3 id="pr-time-buckets" className="text-micro font-semibold tracking-[0.06em] text-subtle uppercase">
        {`Where the ${dur(age)} went`}
      </h3>
      <ol className="flex h-[34px] gap-[3px]">
        {buckets.map((bucket) => (
          <li
            key={bucket.name}
            className={`flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-2.5 text-control whitespace-nowrap text-ink ${TONE[bucket.name]}`}
            style={{ flex: Math.max(bucket.ms / 60_000, 24) }}
          >
            <span className="truncate">{bucket.name}</span> <b className="tabular-nums">{dur(bucket.ms)}</b>
          </li>
        ))}
      </ol>
      <p className="text-control text-muted">{sentence}</p>
    </section>
  );
}
