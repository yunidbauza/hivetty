import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CONTAINER_AGENT_FILE,
  CONTAINER_MCP_FILE,
  CONTAINER_SCRIPT_FILE,
  CONTAINER_SETTINGS_FILE,
} from '../../container/layout';
import type { ContainerSetInput } from '../port';

import { containerMcpConfig } from './mcp-config';
import { agentSettings, hookSettings, metricsScript, statusLineSettings } from './settings';

/** The Claude Code half of a container set (HIVE-132, HIVE-235): what each file says. Layout is `container/generated.ts`'s. */
export async function writeContainerSet(
  root: string,
  { origins, freshness, mode, identity, containerRoot, run }: ContainerSetInput,
): Promise<void> {
  /*
    `command`, not `http`, for both files below (HIVE-137): the binary refuses
    an http hook to any non-loopback private address, and `host.docker.internal`
    is one — measured from inside a container, recorded on `statusCommand`. A
    command hook is `curl` with the same headers and the payload from stdin,
    and `curl` is what the ready and `/done` commands in this same set already
    rely on being there.
  */
  const settings = hookSettings(origins.url, origins.readyUrl, identity, 'command');

  if (origins.metricsUrl !== undefined) {
    const scriptPath = join(root, CONTAINER_SCRIPT_FILE);

    await writeFile(
      scriptPath,
      metricsScript(origins.metricsUrl, identity),
      'utf8',
    );
    /* Owner-only, for the reason `writeHookSettings` sets the same bit. */
    await chmod(scriptPath, 0o700);
    /*
      The path the *reader* of this settings file will see, which is not
      necessarily the path we just wrote to. Claude Code runs this command with
      `/bin/sh <path>`, so a host absolute path baked into a file that is about
      to be mounted somewhere else names a script that does not exist there —
      no metrics, while still paying the configured-status-line cost (Claude
      Code drops its footer key hints for any configured status line).

      `containerRoot` is how HIVE-133 says where the set will be mounted. Absent,
      the host path is correct: that is a bind mount at the same path, and it is
      also every non-container caller.
    */
    settings.statusLine = statusLineSettings(
      containerRoot === undefined
        ? scriptPath
        : join(containerRoot, CONTAINER_SCRIPT_FILE),
    );
  }

  await writeFile(
    join(root, CONTAINER_SETTINGS_FILE),
    `${JSON.stringify(settings, null, 2)}\n`,
    { encoding: 'utf8', mode },
  );
  await writeFile(
    join(root, CONTAINER_AGENT_FILE),
    `${JSON.stringify(
      agentSettings(origins.url, origins.readyUrl, identity, 'command'),
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode },
  );
  await writeFile(
    join(root, CONTAINER_MCP_FILE),
    containerMcpConfig(
      freshness,
      identity === undefined
        ? undefined
        : {
            receiverUrl: origins.origin,
            session: identity.session,
            token: identity.token,
            /*
              Carried explicitly, because `HookIdentity` has no run and the
              `exec-env` flavour goes to real trouble to keep one. Without it
              two concurrent containerised runs would both send an empty
              `x-hive-run`, the route would read both as absent, and their asks
              would be indistinguishable — the exact thing HIVE-128 exists to
              prevent, reintroduced only for `rewrite`.
            */
            ...(run === undefined ? {} : { run }),
          },
    ),
    { encoding: 'utf8', mode },
  );

  /*
    `writeFile`'s `mode` applies only when it creates the file — an existing one
    keeps whatever it had. This set is rewritten on every launch and on every
    re-spawn, so without an explicit `chmod` a file created once at `0644` would
    keep those bits for the rest of its life even after it starts carrying a
    token.
  */
  await Promise.all(
    [CONTAINER_SETTINGS_FILE, CONTAINER_AGENT_FILE, CONTAINER_MCP_FILE].map((file) =>
      chmod(join(root, file), mode),
    ),
  );
}
