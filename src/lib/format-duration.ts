/** `38s`, `4m 12s`, `1h 2m`. Two units, unlike `ageLabel`, which is a column. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${String(s)}s`;
  if (s < 3600) return `${String(Math.floor(s / 60))}m ${String(s % 60)}s`;
  return `${String(Math.floor(s / 3600))}h ${String(Math.floor((s % 3600) / 60))}m`;
}
