// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createJira } from '../../../../../electron/main/integrations/jira';
import type {
  SecretFile,
  SecretStore,
} from '../../../../../electron/main/integrations/jira/auth';
import type { FetchLike } from '../../../../../electron/main/integrations/jira/client';
import {
  toComment,
  toIssueLink,
  toJiraUser,
  toRemoteLink,
} from '../../../../../electron/main/integrations/jira/mapping';
import {
  emptySnapshot,
  type JiraConfig,
} from '../../../../../electron/shared/config-contract';

/**
 * Comments and links (HIVE-71).
 *
 * The mapping half and the verb half. The properties that carry the story: a
 * link's **direction wording** survives, a comment's body is rendered rather
 * than forwarded raw, and a comment that fails local ADF validation **never
 * reaches Jira**.
 */

const TOKEN = 'ATATT-not-a-real-token-9f3c';
const SITE = 'behiques.atlassian.net';

const CONFIGURED: JiraConfig = {
  site: SITE,
  email: 'me@example.com',
  jql: null,
  workflow: null,
};

function store(): SecretStore {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (cipher) => cipher.toString('utf8').slice(4),
  };
}

function file(): SecretFile {
  let bytes: Buffer | null = null;
  return {
    read: () => bytes,
    write: (next) => {
      bytes = next;
    },
    clear: () => {
      bytes = null;
    },
  };
}

const never: FetchLike = () => {
  throw new Error('fetch must not be called');
};

const build = (options: { fetch?: FetchLike; jira?: JiraConfig } = {}) =>
  createJira({
    store: store(),
    file: file(),
    env: { JIRA_API_KEY: TOKEN },
    config: () => ({
      ...emptySnapshot('/tmp/config.json'),
      jira: options.jira ?? CONFIGURED,
    }),
    fetch: options.fetch ?? never,
    sleep: () => Promise.resolve(),
  });

/** Answer each call from a queue of [status, body], recording the requests. */
function replies(
  answers: [number, unknown][],
  seen: { url: string; method: string; body?: unknown }[] = [],
): FetchLike {
  let at = 0;
  return (url, init) => {
    seen.push({
      url,
      method: String(init.method),
      ...(typeof init.body === 'string'
        ? { body: JSON.parse(init.body) as unknown }
        : {}),
    });
    const [status, body] = answers[Math.min(at, answers.length - 1)] ?? [200, {}];
    at += 1;
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

const adfBody = (text: string): unknown => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const rawComment = (over: Record<string, unknown> = {}): unknown => ({
  self: `https://${SITE}/rest/api/3/issue/1/comment/1`,
  id: '10001',
  author: {
    accountId: '712020:9f3c',
    displayName: 'Yunid Bauza',
    emailAddress: 'private@example.com',
    avatarUrls: { '48x48': 'https://example.invalid/a.png' },
  },
  body: adfBody('Looks good to me.'),
  created: '2026-08-07T00:00:00.000-0400',
  updated: '2026-08-07T00:00:00.000-0400',
  ...over,
});

describe('toComment', () => {
  it('maps author, timestamp and rendered body', () => {
    expect(toComment(rawComment())).toEqual({
      id: '10001',
      author: 'Yunid Bauza',
      authorId: '712020:9f3c',
      created: '2026-08-07T00:00:00.000-0400',
      body: [
        { kind: 'paragraph', runs: [{ text: 'Looks good to me.', marks: [] }] },
      ],
    });
  });

  it('omits `updated` when the comment was never edited', () => {
    // Jira sends `updated === created` for an untouched comment, and showing
    // "edited" on one nobody edited is a small lie told very often.
    expect(toComment(rawComment())).not.toHaveProperty('updated');
  });

  it('keeps `updated` when it differs', () => {
    const mapped = toComment(
      rawComment({ updated: '2026-08-08T09:00:00.000-0400' }),
    );
    expect(mapped?.updated).toBe('2026-08-08T09:00:00.000-0400');
  });

  it('falls back to Unknown rather than dropping an authorless comment', () => {
    expect(toComment(rawComment({ author: undefined }))?.author).toBe('Unknown');
  });

  it('answers null for an entry it cannot read', () => {
    expect(toComment(null)).toBeNull();
    expect(toComment({})).toBeNull();
    expect(toComment(rawComment({ id: undefined }))).toBeNull();
    expect(toComment(rawComment({ created: undefined }))).toBeNull();
  });

  it('renders an unreadable body as empty rather than failing the comment', () => {
    expect(toComment(rawComment({ body: 'not adf' }))?.body).toEqual([]);
  });

  it('drops the fields the app did not ask for', () => {
    const serialised = JSON.stringify(toComment(rawComment()));
    for (const leaked of ['self', 'avatarUrls', 'private@example.com']) {
      expect(serialised).not.toContain(leaked);
    }
  });

  it('reads via only from the Hive\'s own property with a valid agent name (HIVE-216)', () => {
    const via = (properties: unknown) => toComment(rawComment({ properties }))?.via;

    expect(via([{ key: 'hive.via', value: { agent: 'builder' } }])).toEqual({ agent: 'builder' });
    expect(via([{ key: 'other.via', value: { agent: 'builder' } }])).toBeUndefined();
    expect(via([{ key: 'hive.via', value: 'builder' }])).toBeUndefined();
    expect(via([{ key: 'hive.via', value: { agent: 'Builder Bot' } }])).toBeUndefined();
    expect(via([{ key: 'hive.via', value: { agent: '../etc' } }])).toBeUndefined();
    expect(via('nope')).toBeUndefined();
    expect(via(undefined)).toBeUndefined();
  });

  it('omits authorId when Jira sent none (HIVE-216)', () => {
    expect(toComment(rawComment({ author: { displayName: 'Ghost' } }))).not.toHaveProperty('authorId');
  });
});

describe('toJiraUser (HIVE-216)', () => {
  it('keeps an active person, as id and name', () => {
    expect(
      toJiraUser({ accountId: '712020:dana', displayName: 'Dana Kim', accountType: 'atlassian', active: true, emailAddress: 'x@y' }),
    ).toEqual({ accountId: '712020:dana', displayName: 'Dana Kim' });
  });

  it('drops an inactive account, an app, and anything unreadable', () => {
    expect(toJiraUser({ accountId: 'a', displayName: 'Gone', accountType: 'atlassian', active: false })).toBeNull();
    expect(toJiraUser({ accountId: 'b', displayName: 'Bot', accountType: 'app', active: true })).toBeNull();
    expect(toJiraUser({ displayName: 'No id', accountType: 'atlassian', active: true })).toBeNull();
    expect(toJiraUser('x')).toBeNull();
  });
});

describe('toRemoteLink', () => {
  it('reads title and url out of `object`', () => {
    expect(
      toRemoteLink({
        id: 1,
        object: { url: 'https://example.invalid/doc', title: 'The doc' },
      }),
    ).toEqual({ kind: 'remote', title: 'The doc', url: 'https://example.invalid/doc' });
  });

  it('falls back to the url when there is no title', () => {
    expect(
      toRemoteLink({ object: { url: 'https://example.invalid/doc' } })?.title,
    ).toBe('https://example.invalid/doc');
  });

  it('answers null without a url or an object', () => {
    expect(toRemoteLink({ object: {} })).toBeNull();
    expect(toRemoteLink({})).toBeNull();
    expect(toRemoteLink(null)).toBeNull();
  });
});

describe('toIssueLink — the direction is the whole point', () => {
  const linkType = { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' };

  it('uses the outward wording for an outwardIssue', () => {
    const link = toIssueLink(
      {
        type: linkType,
        outwardIssue: {
          key: 'HIVE-72',
          fields: { summary: 'A bug', status: { name: 'To Do' } },
        },
      },
      SITE,
    );

    expect(link).toEqual({
      kind: 'issue',
      title: 'HIVE-72 — A bug',
      url: `https://${SITE}/browse/HIVE-72`,
      relationship: 'blocks',
      status: 'To Do',
      key: 'HIVE-72',
      summary: 'A bug',
      statusCategory: 'todo',
      linkType: 'Blocks',
      direction: 'outward',
    });
  });

  it('carries the structured fields beside the wording (HIVE-202)', () => {
    const outward = toIssueLink(
      {
        type: linkType,
        outwardIssue: {
          key: 'HIVE-72',
          fields: { summary: 'A bug', status: { name: 'In Review', statusCategory: { key: 'indeterminate' } } },
        },
      },
      SITE,
    );
    const inward = toIssueLink(
      { type: linkType, inwardIssue: { key: 'HIVE-1', fields: { summary: 'Root', status: { name: 'Done', statusCategory: { key: 'done' } } } } },
      SITE,
    );

    expect(outward).toEqual({
      kind: 'issue',
      title: 'HIVE-72 — A bug',
      url: `https://${SITE}/browse/HIVE-72`,
      relationship: 'blocks',
      status: 'In Review',
      key: 'HIVE-72',
      summary: 'A bug',
      statusCategory: 'in-progress',
      linkType: 'Blocks',
      direction: 'outward',
    });
    expect(inward).toMatchObject({ key: 'HIVE-1', statusCategory: 'done', linkType: 'Blocks', direction: 'inward', relationship: 'is blocked by' });
  });

  it('uses the inward wording for an inwardIssue', () => {
    const link = toIssueLink(
      { type: linkType, inwardIssue: { key: 'HIVE-1' } },
      SITE,
    );

    // "blocks" and "is blocked by" are opposite facts. An entry that kept the
    // key and dropped the direction would read as information while saying the
    // opposite of the truth half the time.
    expect(link?.relationship).toBe('is blocked by');
  });

  it('falls back to a neutral wording rather than none', () => {
    const link = toIssueLink(
      { type: {}, outwardIssue: { key: 'HIVE-1' } },
      SITE,
    );
    expect(link?.relationship).toBe('relates to');
  });

  it('answers null without a type or a linked issue', () => {
    expect(toIssueLink({ outwardIssue: { key: 'A-1' } }, SITE)).toBeNull();
    expect(toIssueLink({ type: linkType }, SITE)).toBeNull();
    expect(toIssueLink(null, SITE)).toBeNull();
  });
});

describe('comments', () => {
  it('reads them oldest first, from the comment endpoint', async () => {
    const seen: { url: string; method: string }[] = [];
    const result = await build({
      fetch: replies([[200, { comments: [rawComment()] }]], seen),
    }).comments({ key: 'HIVE-71' });

    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/rest/api/3/issue/HIVE-71/comment');
    // A comment thread is an argument, and reading one backwards is how you
    // misunderstand it.
    expect(url.searchParams.get('orderBy')).toBe('created');
    expect(result.ok && result.value.comments).toHaveLength(1);
  });

  it('reads the newest page when asked, still oldest first, with the total (HIVE-203)', async () => {
    const seen: { url: string; method: string }[] = [];
    const result = await build({
      fetch: replies([[200, { total: 80, comments: [rawComment({ id: '9' }), rawComment({ id: '8' })] }]], seen),
    }).comments({ key: 'HIVE-71', newest: true });

    const url = new URL(seen[0]?.url ?? '');
    expect(url.searchParams.get('orderBy')).toBe('-created');
    expect(result).toEqual({
      ok: true,
      value: { comments: [expect.objectContaining({ id: '8' }), expect.objectContaining({ id: '9' })], total: 80 },
    });
  });

  it('falls back to the count when Jira sends no total (HIVE-203)', async () => {
    const result = await build({ fetch: replies([[200, { comments: [rawComment()] }]]) })
      .comments({ key: 'HIVE-71' });
    expect(result.ok && result.value.total).toBe(1);
  });

  it('skips an unreadable comment rather than losing the conversation', async () => {
    const result = await build({
      fetch: replies([
        [200, { comments: [rawComment(), { nothing: true }, rawComment({ id: '2' })] }],
      ]),
    }).comments({ key: 'HIVE-71' });

    expect(result.ok && result.value.comments.map((c) => c.id)).toEqual(['10001', '2']);
  });

  it('answers an empty list when there are none', async () => {
    const result = await build({ fetch: replies([[200, { comments: [] }]]) })
      .comments({ key: 'HIVE-71' });
    expect(result).toEqual({ ok: true, value: { comments: [], total: 0 } });
  });

  it('refuses before configuration, without asking', async () => {
    const result = await build({
      jira: { site: null, email: null, jql: null, workflow: null },
    }).comments({ key: 'HIVE-71' });
    expect(result.ok).toBe(false);
  });

  it('asks for the comment properties, so a comment posted for an agent reads back with via (HIVE-216)', async () => {
    const seen: { url: string; method: string }[] = [];
    const result = await build({
      fetch: replies([[200, { comments: [rawComment({ properties: [{ key: 'hive.via', value: { agent: 'acr' } }] })] }]], seen),
    }).comments({ key: 'HIVE-71' });

    expect(new URL(seen[0]?.url ?? '').searchParams.get('expand')).toBe('properties');
    expect(result.ok && result.value.comments[0]?.via).toEqual({ agent: 'acr' });
  });
});

describe('links', () => {
  it('merges remote links and issue links into one list', async () => {
    const result = await build({
      fetch: replies([
        [200, [{ object: { url: 'https://example.invalid/d', title: 'Doc' } }]],
        [
          200,
          {
            fields: {
              issuelinks: [
                {
                  type: { outward: 'blocks', inward: 'is blocked by' },
                  outwardIssue: { key: 'HIVE-72' },
                },
              ],
            },
          },
        ],
      ]),
    }).links({ key: 'HIVE-71' });

    expect(result.ok && result.value.map((l) => l.kind)).toEqual([
      'remote',
      'issue',
    ]);
    expect(result.ok && result.value[1]?.relationship).toBe('blocks');
  });

  it('asks the issue endpoint only for issuelinks', async () => {
    const seen: { url: string; method: string }[] = [];
    await build({
      fetch: replies(
        [
          [200, []],
          [200, { fields: { issuelinks: [] } }],
        ],
        seen,
      ),
    }).links({ key: 'HIVE-71' });

    expect(new URL(seen[1]?.url ?? '').searchParams.get('fields')).toBe(
      'issuelinks',
    );
  });

  it('reports a failure rather than answering with half the list', async () => {
    const result = await build({
      fetch: replies([[403, {}]]),
    }).links({ key: 'HIVE-71' });

    // A list missing the half that failed is indistinguishable from an issue
    // that genuinely has no links that way.
    expect(!result.ok && result.error.kind).toBe('forbidden');
  });
});

describe('addComment', () => {
  it('converts markdown to ADF and posts it', async () => {
    const seen: { url: string; method: string; body?: unknown }[] = [];
    await build({
      fetch: replies([[201, rawComment()]], seen),
    }).addComment({ key: 'HIVE-71', markdown: 'Looks **good**.' });

    expect(seen[0]?.method).toBe('POST');
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(
      '/rest/api/3/issue/HIVE-71/comment',
    );

    const body = seen[0]?.body as { body?: { type?: string; content?: unknown[] } };
    expect(body.body?.type).toBe('doc');
    // The mark survived the trip, which is the entire reason this pipeline
    // exists rather than sending the string.
    expect(JSON.stringify(body.body)).toContain('"strong"');
    expect(JSON.stringify(body.body)).not.toContain('**');
  });

  it('answers with the created comment, mapped', async () => {
    const result = await build({
      fetch: replies([[201, rawComment()]]),
    }).addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect(result.ok && result.value.author).toBe('Yunid Bauza');
    expect(result.ok && result.value.body).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Looks good to me.', marks: [] }] },
    ]);
  });

  it('reports a refusal from Jira', async () => {
    const result = await build({
      fetch: replies([[403, {}]]),
    }).addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect(!result.ok && result.error.kind).toBe('forbidden');
  });

  it('reports an answer it cannot read', async () => {
    const result = await build({
      fetch: replies([[201, { nothing: true }]]),
    }).addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect(!result.ok && result.error.kind).toBe('unknown');
  });

  it('refuses before configuration, without posting', async () => {
    const seen: { url: string; method: string }[] = [];
    const result = await build({
      jira: { site: null, email: null, jql: null, workflow: null },
      fetch: replies([[201, rawComment()]], seen),
    }).addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('never contains the token', async () => {
    const result = await build({
      fetch: replies([[201, rawComment()]]),
    }).addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('sends the via property only when posting for an agent (HIVE-216)', async () => {
    const seen: { url: string; method: string; body?: unknown }[] = [];
    const jira = build({ fetch: replies([[201, rawComment()], [201, rawComment()]], seen) });

    await jira.addComment({ key: 'HIVE-71', markdown: 'hi' }, { agent: 'builder' });
    await jira.addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect((seen[0]?.body as { properties?: unknown }).properties).toEqual([
      { key: 'hive.via', value: { agent: 'builder' } },
    ]);
    expect(seen[1]?.body).not.toHaveProperty('properties');
  });

  it('puts mention nodes first, and posts a mention-only comment (HIVE-216)', async () => {
    const seen: { url: string; method: string; body?: unknown }[] = [];
    await build({ fetch: replies([[201, rawComment()]], seen) }).addComment({
      key: 'HIVE-71',
      markdown: '',
      mentions: [{ accountId: '712020:dana', name: 'Dana Kim' }],
    });

    const body = seen[0]?.body as { body: { content: { content: unknown[] }[] } };
    expect(body.body.content[0]?.content[0]).toEqual({
      type: 'mention',
      attrs: { id: '712020:dana', text: '@Dana Kim' },
    });
  });

  it('answers a comment posted for an agent with via already set (HIVE-216)', async () => {
    const result = await build({
      fetch: replies([[201, rawComment({ properties: [{ key: 'hive.via', value: { agent: 'builder' } }] })]]),
    }).addComment({ key: 'HIVE-71', markdown: 'hi' }, { agent: 'builder' });

    expect(result.ok && result.value.via).toEqual({ agent: 'builder' });
  });

  it('sets via itself when Jira\'s answer to the POST leaves the property out (HIVE-216)', async () => {
    const result = await build({ fetch: replies([[201, rawComment()]]) }).addComment(
      { key: 'HIVE-71', markdown: 'hi' },
      { agent: 'builder' },
    );

    expect(result.ok && result.value.via).toEqual({ agent: 'builder' });
  });

  it('leaves via off a comment posted for nobody', async () => {
    const result = await build({ fetch: replies([[201, rawComment()]]) }).addComment({ key: 'HIVE-71', markdown: 'hi' });

    expect(result.ok && result.value.via).toBeUndefined();
  });
});

describe('searchUsers (HIVE-216)', () => {
  it('asks user/search for eight, and keeps active people only', async () => {
    const seen: { url: string; method: string }[] = [];
    const result = await build({
      fetch: replies(
        [[200, [
          { accountId: '712020:dana', displayName: 'Dana Kim', accountType: 'atlassian', active: true },
          { accountId: 'gone', displayName: 'Gone', accountType: 'atlassian', active: false },
          { accountId: 'bot', displayName: 'Automation', accountType: 'app', active: true },
        ]]],
        seen,
      ),
    }).searchUsers({ query: 'da' });

    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/rest/api/3/user/search');
    expect(url.searchParams.get('query')).toBe('da');
    expect(url.searchParams.get('maxResults')).toBe('8');
    expect(result).toEqual({ ok: true, value: [{ accountId: '712020:dana', displayName: 'Dana Kim' }] });
  });

  it('reports a failure, and refuses before configuration without asking', async () => {
    expect((await build({ fetch: replies([[403, {}]]) }).searchUsers({ query: 'da' })).ok).toBe(false);
    const seen: { url: string; method: string }[] = [];
    const bare = await build({ jira: { site: null, email: null, jql: null, workflow: null }, fetch: replies([[200, []]], seen) }).searchUsers({ query: 'da' });
    expect(bare.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });
});
