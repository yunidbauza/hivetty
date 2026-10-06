// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { validateAdf } from '../../../../../../electron/main/integrations/jira/adf/adf-validate';
import { convertMarkdown } from '../../../../../../electron/main/integrations/jira/adf/markdown-to-adf';
import { withMentions } from '../../../../../../electron/main/integrations/jira/adf/with-mentions';

/** Mention nodes at the front of a comment (HIVE-216). */

const DANA = { accountId: '712020:dana', name: 'Dana Kim' };
const CAM = { accountId: '712020:cam', name: 'Cam' };
const mention = (m: { accountId: string; name: string }) => ({
  type: 'mention',
  attrs: { id: m.accountId, text: `@${m.name}` },
});

describe('withMentions', () => {
  it('leaves the document alone with nobody to mention', () => {
    const doc = convertMarkdown('hi');
    expect(withMentions(doc, [])).toBe(doc);
  });

  it('puts the mentions, space-separated, at the front of a leading paragraph', () => {
    const out = withMentions(convertMarkdown('can you look?'), [DANA, CAM]);
    expect(out.content[0]).toEqual({
      type: 'paragraph',
      content: [
        mention(DANA),
        { type: 'text', text: ' ' },
        mention(CAM),
        { type: 'text', text: ' ' },
        { type: 'text', text: 'can you look?' },
      ],
    });
    expect(validateAdf(out)).toEqual({ ok: true });
  });

  it('adds a paragraph when the comment starts with a block, or is empty', () => {
    const listed = withMentions(convertMarkdown('- one\n- two'), [DANA]);
    expect(listed.content[0]).toEqual({ type: 'paragraph', content: [mention(DANA), { type: 'text', text: ' ' }] });
    expect(listed.content[1]?.type).toBe('bulletList');
    expect(validateAdf(listed)).toEqual({ ok: true });

    const bare = withMentions(convertMarkdown(''), [DANA]);
    expect(bare.content).toEqual([{ type: 'paragraph', content: [mention(DANA), { type: 'text', text: ' ' }] }]);
    expect(validateAdf(bare)).toEqual({ ok: true });
  });
});
