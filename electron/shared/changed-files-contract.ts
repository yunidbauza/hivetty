/**
 * The files a session changed, read from its own transcript (HIVE-201).
 * Types only, so both processes may import it.
 */
/** `A`: the first write this session saw was a create. `M`: anything else. */
export type ChangeMark = 'A' | 'M';

export interface ChangedFile {
  /** Relative to the Files tree's root: `sessionRoot(...) ?? project root`. The tree's own `relPath`. */
  path: string;
  mark: ChangeMark;
  added: number;
  removed: number;
}

/** One session's full list, first-seen order. `files: []` means none, or the session is gone. */
export interface ChangedFilesEvent {
  entityId: string;
  files: ChangedFile[];
}

export interface ChangedFilesSnapshot {
  sessions: ChangedFilesEvent[];
}
