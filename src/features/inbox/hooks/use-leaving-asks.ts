import { useEffect, useRef, useState } from 'react';

import type { HiveNotification } from '@/types/notification';

/** How long a closed ask's line stays where its card was (HIVE-218). */
export const LEAVE_MS = 1600;

export interface Placed {
  row: HiveNotification;
  /** Gone from the list: draw the reason line, not the card. */
  leaving: boolean;
}

/**
 * The rows, plus any ask that just left them, kept at its old index for {@link LEAVE_MS}
 * (HIVE-218). Every departure is held; `AskLeaving` draws nothing for one that never closed
 * (a fold, a hand dismiss), which also covers main's dismiss landing before the ledger event.
 */
export function useLeavingAsks(rows: readonly HiveNotification[]): Placed[] {
  const previous = useRef<readonly HiveNotification[]>(rows);
  const [leaving, setLeaving] = useState<{ row: HiveNotification; index: number }[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const live = new Set(rows.map((row) => row.id));
    const gone = previous.current.flatMap((row, index) =>
      row.action.type === 'ask' && !live.has(row.id) ? [{ row, index }] : [],
    );
    previous.current = rows;
    if (gone.length === 0) return;
    setLeaving((held) => [...held.filter((h) => !live.has(h.row.id)), ...gone]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setLeaving((held) => held.filter((h) => !gone.some((g) => g.row.id === h.row.id)));
    }, LEAVE_MS);
    timers.current.add(timer);
  }, [rows]);

  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  const placed: Placed[] = rows.map((row) => ({ row, leaving: false }));
  for (const { row, index } of [...leaving].sort((x, y) => x.index - y.index)) {
    if (rows.some((r) => r.id === row.id)) continue;
    placed.splice(Math.min(index, placed.length), 0, { row, leaving: true });
  }
  return placed;
}
