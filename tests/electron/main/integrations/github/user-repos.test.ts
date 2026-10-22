// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseUserRepos } from '../../../../../electron/main/integrations/github/user-repos';

/**
 * The viewer's repositories, read out of `gh api graphql`.
 *
 * Every row is validated rather than trusted: what survives becomes a URL the
 * clone view hands to `git`, so a row that is not plainly an https GitHub
 * repository is dropped, and one bad row never sinks the list.
 */

const node = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  nameWithOwner: 'acme/nova-web',
  url: 'https://github.com/acme/nova-web',
  isPrivate: true,
  isFork: false,
  isArchived: false,
  pushedAt: '2026-10-22T12:59:14Z',
  ...over,
});

const reply = (nodes: unknown[], totalCount = nodes.length): string =>
  JSON.stringify({ data: { viewer: { repositories: { totalCount, nodes } } } });

describe('parseUserRepos', () => {
  it('reads a row into owner, name and an https clone URL', () => {
    expect(parseUserRepos(reply([node()]))).toEqual({
      total: 1,
      repos: [
        {
          owner: 'acme',
          name: 'nova-web',
          url: 'https://github.com/acme/nova-web.git',
          isPrivate: true,
          isFork: false,
          isArchived: false,
          pushedAt: '2026-10-22T12:59:14Z',
        },
      ],
    });
  });

  it('keeps the order GitHub sent, which is most recently pushed first', () => {
    const parsed = parseUserRepos(
      reply([node({ nameWithOwner: 'acme/b' }), node({ nameWithOwner: 'acme/a' })]),
    );
    expect(parsed?.repos.map((repo) => repo.name)).toEqual(['b', 'a']);
  });

  it('reports totalCount, which can exceed the rows returned', () => {
    expect(parseUserRepos(reply([node()], 240))?.total).toBe(240);
  });

  it('strips a trailing slash before adding .git', () => {
    const parsed = parseUserRepos(reply([node({ url: 'https://github.com/acme/nova-web/' })]));
    expect(parsed?.repos[0]?.url).toBe('https://github.com/acme/nova-web.git');
  });

  it("keeps an enterprise host, because the URL is GitHub's own", () => {
    const parsed = parseUserRepos(reply([node({ url: 'https://ghe.acme.io/acme/nova-web' })]));
    expect(parsed?.repos[0]?.url).toBe('https://ghe.acme.io/acme/nova-web.git');
  });

  it.each([
    ['a nameWithOwner that is not owner/name', { nameWithOwner: 'acme' }],
    ['a nameWithOwner with a space', { nameWithOwner: 'acme/nova web' }],
    ['a non-https URL', { url: 'http://github.com/acme/nova-web' }],
    ['a URL that does not parse', { url: 'not a url' }],
    ['an ssh URL', { url: 'ssh://git@github.com/acme/nova-web' }],
    ['a non-string URL', { url: 42 }],
    ['a non-boolean flag', { isPrivate: 'yes' }],
    ['a null pushedAt (an empty repository: nothing to clone)', { pushedAt: null }],
    ['a pushedAt that is not a date', { pushedAt: 'yesterday' }],
  ])('drops a row with %s and keeps the rest', (_label, over) => {
    const parsed = parseUserRepos(reply([node(over), node({ nameWithOwner: 'acme/ok' })]));
    expect(parsed?.repos.map((repo) => repo.name)).toEqual(['ok']);
  });

  it('drops a node that is not an object', () => {
    expect(parseUserRepos(reply([null, 'x', node()]))?.repos).toHaveLength(1);
  });

  it.each([
    ['not JSON', 'nope'],
    ['no repositories connection', JSON.stringify({ data: { viewer: {} } })],
    [
      'nodes that are not an array',
      JSON.stringify({ data: { viewer: { repositories: { totalCount: 1, nodes: {} } } } }),
    ],
    [
      'a totalCount that is not a number',
      JSON.stringify({ data: { viewer: { repositories: { totalCount: '1', nodes: [] } } } }),
    ],
  ])('answers null for %s', (_label, stdout) => {
    expect(parseUserRepos(stdout)).toBeNull();
  });
});
