import { Tag } from '@components/ui/tag';

interface ProjectKeyProps {
  /** The project's alias — two to four lowercase letters (HIVE-94). */
  value: string;
  /** Native tooltip, for the row that has room to explain what a key is for. */
  title?: string;
}

/**
 * The project key, as a chip (HIVE-94).
 *
 * A thin composition over {@link Tag} rather than a `tone` added to it. The
 * chip needs no colour `Tag` does not already have — `brand` ink on the `chip`
 * ground is exactly it — so what a new tone would have carried is not colour at
 * all but *shape*: a fixed width so a column of them lines up
 * whether the key is two letters or four. Putting those on `Tag` would make a
 * general-purpose atom grow a variant that means "project key", which is what
 * this file is for.
 *
 * It lives in `components/ui/` because two feature slices render it — the
 * settings row and the new-session picker — and slices may not import each
 * other. That is the fence working as intended: shared UI moves down, not
 * sideways.
 *
 * Sans like every other identifier (ticket keys, branches, PR numbers); the
 * design system keeps mono for code and consoles. `tabular-nums` and the fixed
 * width are what make a column of keys line up.
 */
export function ProjectKey({ value, title }: ProjectKeyProps) {
  return (
    <Tag
      tone="brand"
      title={title}
      className="w-11 shrink-0 justify-center tabular-nums lowercase"
    >
      {value}
    </Tag>
  );
}
