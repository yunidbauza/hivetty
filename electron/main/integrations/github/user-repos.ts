import type { GhResult, UserRepo } from '../../../shared/github-contract';

import { classifyGhFailure, ghError } from './classify';
import { NAME_WITH_OWNER } from './repos';
import type { RunAsync } from './run';

/**
 * The repositories the `gh` account can reach, for the clone picker.
 *
 * ## The argv is a constant
 *
 * The verb that reaches this takes no payload, so nothing the user types can
 * land in an argument. Filtering happens in the renderer over this one list.
 * That is `gh.ts`'s rule 3, kept: a verb that executes a binary is safe to
 * expose because the renderer contributes nothing to the call.
 *
 * ## Why GraphQL and not `gh repo list`
 *
 * `gh repo list` lists one owner per call, so organisation repositories would
 * need a call each. `viewer.repositories` with all three affiliations is one
 * call for everything the account reaches, already ordered by last push.
 */

export const USER_REPOS_QUERY = `query {
  viewer {
    repositories(
      first: 100
      orderBy: { field: PUSHED_AT, direction: DESC }
      affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
    ) {
      totalCount
      nodes { nameWithOwner url isPrivate isFork isArchived pushedAt }
    }
  }
}`;

export const USER_REPOS_ARGS: readonly string[] = [
  'api',
  'graphql',
  '-f',
  `query=${USER_REPOS_QUERY}`,
];

/** A row before main knows whether a project already points at it. */
export type UserRepoRow = Omit<UserRepo, 'isProject'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * One node, or `null` when any field is not what a clone URL can be built from.
 *
 * A `null` `pushedAt` is an empty repository: there is nothing to clone, so it
 * is dropped with the malformed rows rather than special-cased.
 */
function toRow(node: unknown): UserRepoRow | null {
  if (!isRecord(node)) return null;
  const { nameWithOwner, url, isPrivate, isFork, isArchived, pushedAt } = node;

  if (typeof nameWithOwner !== 'string' || typeof url !== 'string') return null;
  if (
    typeof isPrivate !== 'boolean' ||
    typeof isFork !== 'boolean' ||
    typeof isArchived !== 'boolean'
  ) {
    return null;
  }
  if (typeof pushedAt !== 'string' || Number.isNaN(Date.parse(pushedAt))) return null;

  const match = NAME_WITH_OWNER.exec(nameWithOwner.trim());
  if (match === null) return null;
  const [, owner, name] = match;

  /*
    The clone URL is rebuilt from the parsed parts, never copied from the raw
    string, and the row must say exactly what the picker will show.

    `new URL` forgives what a clone URL must not carry: it trims surrounding
    whitespace and silently drops a tab or newline anywhere. So whitespace is
    refused before parsing, credentials, a query and a fragment after it, and
    the path has to *be* `/<owner>/<name>` (GitHub's names are
    case-insensitive), so a row can never display one repository and clone
    another. `parse-url.ts` still validates whatever the field finally holds;
    this keeps the picker from being the thing that puts it there.
  */
  if (/\s/.test(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.search !== '' || parsed.hash !== '') return null;

  const path = parsed.pathname.replace(/\/+$/, '');
  if (path.toLowerCase() !== `/${owner}/${name}`.toLowerCase()) return null;

  return {
    owner,
    name,
    url: `${parsed.origin}${path}.git`,
    isPrivate,
    isFork,
    isArchived,
    pushedAt,
  };
}

/** The reply, or `null` when it is not the shape the query asks for. */
export function parseUserRepos(
  stdout: string,
): { repos: UserRepoRow[]; total: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }

  const data = isRecord(parsed) ? parsed.data : undefined;
  const viewer = isRecord(data) ? data.viewer : undefined;
  const connection = isRecord(viewer) ? viewer.repositories : undefined;
  if (!isRecord(connection)) return null;

  const { totalCount, nodes } = connection;
  if (typeof totalCount !== 'number' || !Array.isArray(nodes)) return null;

  const repos = nodes
    .map(toRow)
    .filter((row): row is UserRepoRow => row !== null);

  return { repos, total: totalCount };
}

export interface UserRepos {
  list(): Promise<GhResult<{ repos: UserRepoRow[]; total: number }>>;
}

/**
 * Uncached on purpose: one call per visit to the clone view is the budget, and
 * a cached list would hide a repository created a minute ago.
 */
export function createUserRepos(ghPath: string, run: RunAsync): UserRepos {
  return {
    async list() {
      let result;
      try {
        result = await run(ghPath, USER_REPOS_ARGS);
      } catch {
        // `repos.ts`'s reading: it was on the `PATH` moments ago, so this is
        // the machine changing underneath the app.
        return { ok: false, error: ghError('not-installed', 'Could not run `gh`.') };
      }

      if (result.code !== 0) {
        return { ok: false, error: classifyGhFailure(result.stderr, result.timedOut) };
      }

      const parsed = parseUserRepos(result.stdout);
      if (parsed === null) {
        return {
          ok: false,
          error: ghError('unknown', 'GitHub returned a reply the Hive could not read.'),
        };
      }

      return { ok: true, value: parsed };
    },
  };
}
