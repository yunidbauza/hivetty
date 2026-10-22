import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ContainerFreshness } from '@shared/config-contract';
import type { HookIdentity } from '@shared/hook-contract';

import { sessionAdapter } from '../harness/registry';
import { withHostAlias } from '../hooks/container-origin';

import type { ContainerOrigins } from './layout';

export {
  CONTAINER_AGENT_FILE,
  CONTAINER_MCP_FILE,
  CONTAINER_SETTINGS_FILE,
  type ContainerOrigins,
} from './layout';

/**
 * The container-flavoured set of every file a session is launched with
 * (HIVE-132).
 *
 * A **parallel** set rather than a branch inside the existing writers, for the
 * reason `harness/claude-code/settings.ts` already gives about writing both themes up front:
 * writing everything ahead of time means the spawn path never writes, it picks
 * a path. Nothing here decides *which* path — that is HIVE-133's per-project
 * `container` block, and its absence is why this module has no notion of a
 * session being containerised.
 *
 * The filenames match the host set exactly, one directory down, so that choice
 * is a directory swap rather than a per-file mapping.
 */

/** The path segment every constant below is built from, host or container side. */
const CONTAINER_SUBDIR = 'container';

/** `<userData>/hive/container` — the shared, secret-free `exec-env` set. */
export const CONTAINER_DIR = join('hive', CONTAINER_SUBDIR);

/**
 * `container/sessions`, relative to wherever `hive/` itself is mounted.
 *
 * The host reaches the same directory as `<userData>/hive/container/sessions`
 * ({@link CONTAINER_SESSIONS_DIR}, which bakes that `hive/` prefix in); a
 * container reaches it as `<config.hiveDir>/container/sessions`, where
 * `config.hiveDir` **is** the container-side spelling of `<userData>/hive` and
 * so must not have that prefix added a second time. Exported so
 * `hooks/index.ts`'s `containerRoot` — the one path in a session's generated
 * set that names where the container sees it, rather than a URL — builds it
 * from the same three literals as the host-side constant, not a second
 * hand-rolled copy that a rename here would leave silently stale.
 */
export const CONTAINER_SESSIONS_SUBDIR = join(CONTAINER_SUBDIR, 'sessions');

/**
 * `<userData>/hive/container/sessions` — one directory per session, `rewrite`
 * only.
 *
 * Per-session because a resolved `HIVE_HOOK_TOKEN` is per-session, and one
 * shared file cannot carry a per-session secret. That reintroduces exactly what
 * the one-file-per-launch rule avoided — per-session cleanup, and a directory
 * that grows by one entry every time a session starts — so both are paid for
 * rather than inherited: {@link removeSessionContainerFiles} when a session
 * ends, and {@link sweepSessionContainerFiles} at launch for whatever a crash
 * left behind.
 */
export const CONTAINER_SESSIONS_DIR = join(CONTAINER_DIR, 'sessions');

/** `container/aliases`, relative — the container-side sibling of {@link CONTAINER_SESSIONS_SUBDIR}. */
export const CONTAINER_ALIASES_SUBDIR = join(CONTAINER_SUBDIR, 'aliases');

/**
 * `<userData>/hive/container/aliases/<alias>` — one `exec-env` set per distinct
 * host alias (HIVE-133).
 *
 * The shared set at {@link CONTAINER_DIR} bakes a resolved origin, and that
 * origin is built from *an* alias. One machine can run two runtimes — the
 * reason `container.hostAlias` is a per-project field at all — so one baked
 * origin cannot serve every project.
 *
 * Cheap and safe to duplicate: an `exec-env` set is secret-free by
 * construction, every per-session value in it being a `${VAR}`, so a second
 * copy carries no token and stays world-readable.
 *
 * Not swept at launch, unlike the session directories, and deliberately: these
 * hold nothing secret, they are bounded by the number of distinct aliases a
 * user has ever configured, and an orphan is four small files rather than a
 * live credential.
 */
export const CONTAINER_ALIASES_DIR = join(CONTAINER_DIR, 'aliases');

/** The shared `exec-env` set, addressed by one alias rather than the default. */
export const writeAliasContainerFiles = (
  userDataPath: string,
  alias: string,
  origins: ContainerOrigins,
  options?: ContainerSetOptions,
): Promise<void> =>
  writeSet(
    join(userDataPath, CONTAINER_ALIASES_DIR, alias),
    origins,
    'exec-env',
    undefined,
    options,
  );

/** What only the caller placing these files can know (HIVE-133). */
interface ContainerSetOptions {
  /**
   * Where this set will be visible *inside* the container, when that differs
   * from where it is written.
   *
   * Only the status line command needs it: it is the one value in the set that
   * names a path rather than a URL or a `${VAR}`.
   */
  containerRoot?: string;
  /**
   * The run a `rewrite` set belongs to, when it is an agent's.
   *
   * Absent for a pty session, which has no run — the same thing `${HIVE_RUN_ID:-}`
   * collapses to in `exec-env`.
   */
  run?: string;
}

/**
 * The same URLs, addressed by `alias` instead of loopback.
 *
 * Uniform across every field because each is `origin + <fixed path>` and
 * `withHostAlias` rewrites the authority in place: it never touches the path,
 * and it never *adds* one to a bare origin the way a `new URL()` round-trip
 * does.
 */
export const containerOrigins = (
  origins: ContainerOrigins,
  alias: string,
): ContainerOrigins => ({
  url: withHostAlias(origins.url, alias),
  origin: withHostAlias(origins.origin, alias),
  ...(origins.metricsUrl === undefined
    ? {}
    : { metricsUrl: withHostAlias(origins.metricsUrl, alias) }),
  ...(origins.readyUrl === undefined
    ? {}
    : { readyUrl: withHostAlias(origins.readyUrl, alias) }),
});

/**
 * `0600` for anything holding a resolved token, `0644` for anything that does
 * not.
 *
 * In `exec-env` no file here holds a secret — every per-session value is a
 * `${VAR}` — so the set stays world-readable and can be mounted read-only or
 * baked into an image. `rewrite` bakes a live `HIVE_HOOK_TOKEN` into three of
 * the four, and a token that authenticates every hook, ledger and `/done` call
 * has no business being readable by other users on the machine.
 *
 * `statusline.sh` is `0700` in both modes because it is also *executed*; the
 * others are only read.
 */
const modeFor = (identity?: HookIdentity): number =>
  identity === undefined ? 0o644 : 0o600;

const writeSet = async (
  root: string,
  origins: ContainerOrigins,
  freshness: ContainerFreshness,
  identity?: HookIdentity,
  options?: ContainerSetOptions,
): Promise<void> => {
  await mkdir(root, { recursive: true });

  await sessionAdapter().prepare.containerSet(root, {
    origins,
    freshness,
    mode: modeFor(identity),
    ...(identity === undefined ? {} : { identity }),
    ...(options?.containerRoot === undefined ? {} : { containerRoot: options.containerRoot }),
    ...(options?.run === undefined ? {} : { run: options.run }),
  });
};

/**
 * The shared `exec-env` set, written once per launch beside the host one.
 *
 * Holds no secret: every per-session value is a `${VAR}` the container runtime
 * resolves at exec time, which is what lets this directory be mounted
 * read-only or baked into an image.
 */
export const writeSharedContainerFiles = (
  userDataPath: string,
  origins: ContainerOrigins,
  options?: ContainerSetOptions,
): Promise<void> =>
  writeSet(join(userDataPath, CONTAINER_DIR), origins, 'exec-env', undefined, options);

/**
 * One session's `rewrite` set, with its identity resolved. Returns the
 * directory written.
 *
 * Called again for the same session on a re-launch, which is the point: a new
 * `launchSecret` means a new token, and the file has to say so or the container
 * 403s on every call.
 */
export async function writeSessionContainerFiles(
  userDataPath: string,
  sessionId: string,
  origins: ContainerOrigins,
  identity: HookIdentity,
  options?: ContainerSetOptions,
): Promise<string> {
  const root = join(userDataPath, CONTAINER_SESSIONS_DIR, sessionId);

  await writeSet(root, origins, 'rewrite', identity, options);

  return root;
}

/**
 * Take one session's resolved token off disk.
 *
 * Silent when the session never had a directory — a host session ending is the
 * common case, not a failure.
 */
export async function removeSessionContainerFiles(
  userDataPath: string,
  sessionId: string,
): Promise<void> {
  await rm(join(userDataPath, CONTAINER_SESSIONS_DIR, sessionId), {
    recursive: true,
    force: true,
  });
}

/**
 * Remove every session directory except the live ones.
 *
 * Run at launch. Without it a crash leaves a resolved token on disk with no
 * session behind it, and the directory grows by one entry per crash forever.
 */
export async function sweepSessionContainerFiles(
  userDataPath: string,
  live: readonly string[],
): Promise<void> {
  const root = join(userDataPath, CONTAINER_SESSIONS_DIR);

  let entries: string[];

  try {
    entries = await readdir(root);
  } catch {
    /* Never written. Nothing to sweep is the common case, not a failure. */
    return;
  }

  const keep = new Set(live);

  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) => rm(join(root, entry), { recursive: true, force: true })),
  );
}
