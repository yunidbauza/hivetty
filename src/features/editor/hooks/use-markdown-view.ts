import { useCallback } from 'react';

import { useMarkdownOpensIn } from '@stores/appearance-store';
import {
  useActiveMarkdownFile,
  useEditorActions,
  type MarkdownView,
} from '@stores/editor-store';

interface ActiveMarkdownView {
  key: string;
  /** An SVG: Source and Preview only, and Preview whatever the markdown setting says. */
  svg: boolean;
  view: MarkdownView;
  setView: (view: MarkdownView) => void;
}

/**
 * The active file's markdown view, or `null` when it has no preview.
 *
 * Derived here, never stored: the file's own choice wins, the setting fills in
 * otherwise. A changed setting therefore moves every file nobody chose for.
 */
export function useMarkdownView(): ActiveMarkdownView | null {
  const active = useActiveMarkdownFile();
  const opensIn = useMarkdownOpensIn();
  const { setView } = useEditorActions();
  const key = active?.key ?? null;

  const choose = useCallback(
    (view: MarkdownView) => {
      if (key !== null) setView(key, view);
    },
    [key, setView],
  );

  if (active === null) return null;
  const fallback = active.svg ? 'preview' : opensIn;
  return { key: active.key, svg: active.svg, view: active.chosen ?? fallback, setView: choose };
}
