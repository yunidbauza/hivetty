const FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** A clock time, "10:42": the stale line names when, not how long ago (HIVE-211). */
export const clockTime = (ms: number): string => FORMAT.format(ms);
