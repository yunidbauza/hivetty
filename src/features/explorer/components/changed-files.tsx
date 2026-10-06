import { cn } from '@/lib/utils';

import { useChangedFiles } from '@stores/hive-store';

interface ChangedFilesProps {
  /** Main's id for the session: `terminalOf(session)`. */
  changesId: string | undefined;
  /** The tree's project-relative prefix, stripped for display only. */
  subRoot: string;
  onOpenFile: (relPath: string) => void;
}

/**
 * "Changed in this session" (HIVE-201): the files this session edited or
 * created, read from its own transcript by main, above the tree. A click
 * opens the file exactly as a tree row does.
 */
export function ChangedFiles({ changesId, subRoot, onOpenFile }: ChangedFilesProps) {
  const files = useChangedFiles(changesId);
  if (files === undefined || files.length === 0) return null;
  const prefix = subRoot === '' ? '' : `${subRoot}/`;

  return (
    <section aria-label="Changed in this session" className="mb-1">
      <h3 className="flex gap-1.5 px-2 pt-2 pb-1 text-micro font-semibold tracking-[.06em] text-subtle uppercase">
        Changed in this session
        <span className="tabular-nums tracking-normal">{files.length}</span>
      </h3>
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          title={file.path}
          onClick={() => {
            onOpenFile(file.path);
          }}
          className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-[5px] text-left text-control hover:bg-hover"
        >
          <i
            className={cn(
              'w-3.5 shrink-0 text-center tabular-nums text-micro font-semibold not-italic',
              file.mark === 'A' ? 'text-green' : 'text-brand',
            )}
          >
            {file.mark}
          </i>
          <span className="min-w-0 flex-1 truncate tabular-nums text-muted">
            {file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path}
          </span>
          <span className="shrink-0 tabular-nums text-micro whitespace-nowrap text-muted">
            {file.mark === 'A' && file.removed === 0
              ? `+${String(file.added)}`
              : `+${String(file.added)} −${String(file.removed)}`}
          </span>
        </button>
      ))}
    </section>
  );
}
