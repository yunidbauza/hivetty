import type { AdfDoc, AdfNode, JiraMention } from '../../../../shared/jira-contract';

/**
 * Mention nodes at the front of a comment (HIVE-216).
 *
 * One `mention` per person, each followed by a space, ahead of whatever the
 * markdown said. A leading paragraph takes them inline; anything else (a
 * list, a heading, nothing at all) gets a new first paragraph, because a
 * mention is inline and ADF refuses inline content outside a paragraph.
 */
export function withMentions(doc: AdfDoc, mentions: readonly JiraMention[]): AdfDoc {
  if (mentions.length === 0) return doc;

  const lead: AdfNode[] = mentions.flatMap((mention) => [
    { type: 'mention', attrs: { id: mention.accountId, text: `@${mention.name}` } },
    { type: 'text', text: ' ' },
  ]);
  const [first, ...rest] = doc.content;

  if (first?.type === 'paragraph') {
    return { ...doc, content: [{ ...first, content: [...lead, ...(first.content ?? [])] }, ...rest] };
  }
  return { ...doc, content: [{ type: 'paragraph', content: lead }, ...doc.content] };
}
