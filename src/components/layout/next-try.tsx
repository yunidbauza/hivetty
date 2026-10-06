import { useEffect, useState } from 'react';

/**
 * "{prefix} Ns", counting down to the next reconnect attempt (HIVE-196,
 * HIVE-211). Shared by the bar foot's popover and the stage's reconnect line;
 * the interval lives only while it is mounted.
 */
export function NextTry({ at, prefix }: { at: number; prefix: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((at - now) / 1_000));
  return (
    <>
      {prefix} <span className="tabular-nums text-ink">{seconds}s</span>
    </>
  );
}
