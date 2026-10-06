import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** A strip column's head (HIVE-200): sans 600 10.5px, uppercase, 0.06em, subtle. */
export function StripHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 pb-2 text-micro font-semibold tracking-[0.06em] text-subtle uppercase">
      {children}
      {aside}
    </h3>
  );
}

interface StripRowProps {
  icon: ReactNode;
  name: string;
  detail: string;
  value?: string | undefined;
  valueClass?: string;
  title?: string;
  onClick?: (() => void) | undefined;
}

/** One line, never wrapped (HIVE-200): 15px icon, bold name, dim detail, right-aligned mono value. */
export function StripRow({ icon, name, detail, value, valueClass, title, onClick }: StripRowProps) {
  const body = (
    <>
      <span className="flex size-[15px] shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">
        <b className="font-semibold text-ink">{name}</b> <span className="text-muted">{detail}</span>
      </span>
      {value !== undefined && (
        <span className={cn('shrink-0 tabular-nums text-ui-sm', valueClass ?? 'text-muted')}>
          {value}
        </span>
      )}
    </>
  );
  const cls = 'flex min-w-0 items-center gap-2.5 rounded-md px-1 py-[5px] text-ui';
  return onClick === undefined ? (
    <div className={cls} title={title}>
      {body}
    </div>
  ) : (
    <button type="button" className={cn(cls, 'w-full hover:bg-chip')} title={title} onClick={onClick}>
      {body}
    </button>
  );
}
