import { useCallback } from 'react';

import { resolvePaths } from '@lib/explorer/fs-client';
import { useEditorLayout } from '@stores/appearance-store';
import { useEditorActions } from '@stores/editor-store';
import { useRevealStage } from '@stores/ui-store';

export interface OpenAt {
  line: number;
  col?: number;
}

/**
 * Open a file in the editor (HIVE-205, D19): the one sequence terminal links,
 * the plan tab and a PR's review thread all ran inline. Single-file mode closes
 * the others first, here rather than in the store, since no store subscribes
 * to another; opening a file is a request to look at it, so an overlay steps aside.
 */
export function useOpenFileAt() {
  const { openFile, closeAll } = useEditorActions();
  const { nav } = useEditorLayout();
  const revealStage = useRevealStage();

  const openResolved = useCallback(
    (projectId: string, sessionId: string | undefined, target: { relPath: string; rootKey?: string }, at?: OpenAt) => {
      if (nav === 'single') closeAll();
      openFile(projectId, target.relPath, sessionId, target.rootKey, at === undefined ? undefined : { line: at.line, col: at.col ?? 1 });
      revealStage();
    },
    [nav, closeAll, openFile, revealStage],
  );

  /** A path as printed: resolved under the session's root first; one main will not serve opens nothing. */
  const openPath = useCallback(
    (projectId: string, sessionId: string | undefined, path: string, at?: OpenAt) =>
      resolvePaths(projectId, sessionId, [path]).then(([target]) => {
        if (target === null || target === undefined) return;
        openResolved(projectId, sessionId, target, at);
      }),
    [openResolved],
  );

  return { openResolved, openPath };
}
