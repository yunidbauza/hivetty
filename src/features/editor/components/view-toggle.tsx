import { SegmentedControl, type SegmentedOption } from '@components/ui/segmented-control';
import { useMarkdownView } from '@features/editor/hooks/use-markdown-view';
import type { MarkdownView } from '@stores/editor-store';

const VIEW_OPTIONS: readonly SegmentedOption<MarkdownView>[] = [
  { value: 'source', label: 'Source', icon: 'ph-code' },
  { value: 'preview', label: 'Preview', icon: 'ph-eye' },
  { value: 'split', label: 'Split', icon: 'ph-columns' },
];

/** An SVG is shown or edited; there is no scroll position to keep in step. */
const SVG_OPTIONS = VIEW_OPTIONS.filter((option) => option.value !== 'split');

/** Source · Preview · Split for markdown, Source · Preview for SVG. Nothing otherwise. */
export function ViewToggle() {
  const markdown = useMarkdownView();
  if (!markdown) return null;

  return (
    <SegmentedControl
      label={markdown.svg ? 'SVG view' : 'Markdown view'}
      options={markdown.svg ? SVG_OPTIONS : VIEW_OPTIONS}
      value={markdown.view}
      onChange={markdown.setView}
      className="my-auto mr-2 ml-2 shrink-0"
    />
  );
}
