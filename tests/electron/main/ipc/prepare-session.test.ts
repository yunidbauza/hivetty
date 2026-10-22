// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptySnapshot } from '../../../../electron/shared/config-contract';

/**
 * `prepareSession` — what `pty:spawn` and `pty:restart` write before a session
 * starts, and the paths they hand it (HIVE-235).
 *
 * Mocked the way `session-history.test.ts` is: the handlers are only callable
 * by Electron, so `ipcMain.handle` is recorded. The hooks, skills and MCP
 * runtimes are the real ones with the calls under test replaced, so the order
 * they are awaited in and the paths they answer are literals; the session layer
 * is the real one with `open`, `restart` and `containerRemoval` replaced, so
 * what reaches `spawn` is what the handler passed.
 */
const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();

const calls: string[] = [];
const paths: { settings: string | null; plugin: string | null; mcp: string | null } = {
  settings: null,
  plugin: null,
  mcp: null,
};
const open = vi.fn();
const restart = vi.fn((_request: unknown) => Promise.resolve());

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0',
    on: vi.fn(),
    removeListener: vi.fn(),
    // Per-spec, never shared (HIVE-139).
    getPath: () => '/tmp/hive-test-prepare-session',
  },
  BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => '',
  },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, fn);
    },
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}));

vi.mock('../../../../electron/main/pty-host', () => ({
  registerPtyHost: () => ({
    spawn: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    onData: () => () => {},
    onExit: () => () => {},
    onSpawned: () => () => {},
    onError: () => () => {},
    onSessionLost: () => () => {},
    onForeground: () => () => {},
    shutdown: async () => {},
    isRunning: () => true,
    isBlocked: () => false,
    sessionIds: () => [],
  }),
}));

vi.mock('../../../../electron/main/shutdown', () => ({
  onShutdown: vi.fn(),
}));

const snapshot = emptySnapshot('/tmp/config.json', '/bin/zsh');

vi.mock('../../../../electron/main/config/index', () => ({
  getConfig: vi.fn(() => snapshot),
  onConfigChange: vi.fn(() => () => {}),
  reloadConfig: vi.fn(() => snapshot),
  loadConfig: vi.fn(() => snapshot),
  addProject: vi.fn(() => snapshot),
  removeProject: vi.fn(() => snapshot),
  renameProject: vi.fn(() => snapshot),
  repointProject: vi.fn(() => snapshot),
  reorderProjects: vi.fn(() => snapshot),
  configPath: vi.fn(() => '/tmp/config.json'),
}));

vi.mock('../../../../electron/main/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../electron/main/hooks')>();
  return {
    ...actual,
    createHookRuntime: (options: Parameters<typeof actual.createHookRuntime>[0]) => ({
      ...actual.createHookRuntime(options),
      rewriteSettings: () => {
        calls.push('hooks.rewriteSettings');
        return Promise.resolve();
      },
      writeContainerSession: (sessionId: string, projectId: string) => {
        calls.push(`hooks.writeContainerSession ${sessionId} ${projectId}`);
        return Promise.resolve(null);
      },
      settingsPathFor: () => paths.settings,
    }),
  };
});

vi.mock('../../../../electron/main/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../electron/main/skills')>();
  return {
    ...actual,
    createSkillsRuntime: (options: Parameters<typeof actual.createSkillsRuntime>[0]) => ({
      ...actual.createSkillsRuntime(options),
      sync: () => {
        calls.push('skills.sync');
        return Promise.resolve({ names: [] });
      },
      pluginDirPath: () => paths.plugin,
    }),
  };
});

vi.mock('../../../../electron/main/mcp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../electron/main/mcp')>();
  return {
    ...actual,
    createMcpRuntime: (options: Parameters<typeof actual.createMcpRuntime>[0]) => ({
      ...actual.createMcpRuntime(options),
      start: () => {
        calls.push('mcp.start');
        return Promise.resolve();
      },
      configPathFor: () => paths.mcp,
    }),
  };
});

vi.mock('../../../../electron/main/sessions/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../electron/main/sessions/index')>();
  return {
    ...actual,
    createSessions: (options: Parameters<typeof actual.createSessions>[0]) => ({
      ...actual.createSessions(options),
      open,
      restart,
      containerRemoval: (entityId: string) => {
        calls.push(`sessions.containerRemoval ${entityId}`);
        return Promise.resolve();
      },
    }),
  };
});

const { CH } = await import('../../../../electron/shared/ipc-contract');
const { registerIpcHandlers, resetIpcHandlers } = await import('../../../../electron/main/ipc');

const mainFrame = { url: 'file:///out/renderer/index.html' };
const trustedEvent = { senderFrame: mainFrame, sender: { mainFrame } } as never;

const invoke = (channel: string, payload: unknown) =>
  Promise.resolve().then(() => handlers.get(channel)!(trustedEvent, payload));

const REQUEST = { sessionId: 'sess-07', projectId: 'hero', cols: 80, rows: 24 };

beforeEach(() => {
  handlers.clear();
  calls.length = 0;
  paths.settings = '/u/hive/claude-hooks.settings.json';
  paths.plugin = '/u/hive/plugin';
  paths.mcp = '/u/hive/hive.mcp.json';
  vi.clearAllMocks();
  registerIpcHandlers();
  // Construction fires its own unawaited `mcp.start()` and `skills.sync()`; only the handler's count.
  calls.length = 0;
});

afterEach(() => {
  resetIpcHandlers();
});

describe('prepareSession (HIVE-235)', () => {
  it('writes in the order pty:spawn always ran, then opens with the three paths', async () => {
    await invoke(CH.ptySpawn, REQUEST);

    expect(calls).toEqual([
      'skills.sync',
      'hooks.rewriteSettings',
      'mcp.start',
      'sessions.containerRemoval sess-07',
      'hooks.writeContainerSession sess-07 hero',
    ]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]![0]).toMatchObject({
      entityId: 'sess-07',
      projectId: 'hero',
      files: {
        settingsPath: '/u/hive/claude-hooks.settings.json',
        pluginDir: '/u/hive/plugin',
        mcpConfig: '/u/hive/hive.mcp.json',
      },
    });
  });

  it('leaves the container write to restartOnce on pty:restart, and still hands the paths in', async () => {
    await invoke(CH.ptyRestart, REQUEST);

    expect(calls).toEqual(['skills.sync', 'hooks.rewriteSettings', 'mcp.start']);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(restart.mock.calls[0]![0]).toMatchObject({
      entityId: 'sess-07',
      files: {
        settingsPath: '/u/hive/claude-hooks.settings.json',
        pluginDir: '/u/hive/plugin',
        mcpConfig: '/u/hive/hive.mcp.json',
      },
    });
  });

  it('omits a path its runtime has none for, so spawn omits the flag', async () => {
    paths.settings = null;
    paths.plugin = null;
    paths.mcp = null;

    await invoke(CH.ptySpawn, REQUEST);

    expect((open.mock.calls[0]![0] as { files: unknown }).files).toEqual({});
  });
});
