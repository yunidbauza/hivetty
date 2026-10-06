import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  HOOK_ENV_RECEIVER_URL,
  HOOK_ENV_SESSION,
  HOOK_ENV_TOKEN,
  HOOK_HEADER_SESSION,
  HOOK_HEADER_TOKEN,
  HOOK_PATH,
} from '../../../electron/shared/hook-contract';
import { claudeProjectDir } from '../../../electron/main/sessions/title-origin';
import { launchHive, writeProjectConfig } from './fixtures/hive-app';

/**
 * Round two's session panel in the real app (HIVE-201).
 *
 * Hooks are posted from inside the session's own shell, the way a real
 * session's are. The changed-files case stages a transcript under a replaced HOME and
 * posts the `Edit` that makes main read it: what only the built app shows is
 * the whole trip, receiver to transcript to socket-free push to the Files tab.
 */

const PROJECT = 'nova-web';
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');
/** Hex and dashes: the receiver reads `session_id` from a truncated prefix by that shape. */
const TRANSCRIPT_UUID = 'aaaaaaaa-0000-4000-8000-000000000201';

const readMarker = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, 'utf8').trim() : null;

async function expectMarker(path: string, contents: string): Promise<void> {
  await expect.poll(() => readMarker(path), { timeout: 15_000 }).toBe(contents);
}

/** Start a session from the filtered Overmind and answer with its id. */
async function startRoundTwoSession(page: Page): Promise<string> {
  await page
    .getByRole('navigation', { name: 'Places' })
    .getByRole('button', { name: 'Sessions', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Sessions list' })
    .getByRole('button', { name: new RegExp(`^${PROJECT}`) })
    .click();
  await page
    .getByRole('main')
    .getByRole('button', { name: `New session in ${PROJECT}`, exact: true })
    .click();
  const terminal = page.locator('[data-terminal-id^="sess-"]').last();
  await expect(terminal).toBeVisible();
  const id = await terminal.getAttribute('data-terminal-id');
  if (id === null) throw new Error('the spawned session has no terminal id');
  return id;
}

async function shell(page: Page, sessionId: string, command: string): Promise<void> {
  await page.evaluate(
    ([id, data]) => {
      window.hive!.pty.write({ sessionId: id!, data: data! });
    },
    [sessionId, `${command}\n`],
  );
}

function postHookCommand(body: Record<string, unknown>, statusMarker: string): string {
  const payload = JSON.stringify({ hook_event_name: 'PostToolUse', ...body });
  return (
    `curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST "$${HOOK_ENV_RECEIVER_URL}${HOOK_PATH}"` +
    ` -H "${HOOK_HEADER_SESSION}: $${HOOK_ENV_SESSION}"` +
    ` -H "${HOOK_HEADER_TOKEN}: $${HOOK_ENV_TOKEN}"` +
    ` -H "content-type: application/json"` +
    ` --data-binary '${payload}'` +
    ` > '${statusMarker}'`
  );
}

test("a session's task hooks show in the strip and the Plan tab", async ({}, testInfo) => {
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const app = await launchHive({ userDataDir: testInfo.outputPath('user-data'), configPath });
  const page = await app.firstWindow();
  let posts = 0;

  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');
    const session = await startRoundTwoSession(page);
    const post = async (body: Record<string, unknown>) => {
      posts += 1;
      const marker = testInfo.outputPath(`posted-${String(posts)}.txt`);
      await shell(page, session, postHookCommand(body, marker));
      await expectMarker(marker, '204');
    };

    await post({
      tool_name: 'TaskCreate',
      tool_input: { subject: 'Push the branch', description: 'x', activeForm: 'Pushing the branch' },
      tool_response: { task: { id: '1', subject: 'Push the branch' } },
    });
    await post({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: '1', status: 'in_progress' },
      tool_response: { success: true, taskId: '1', updatedFields: ['status'] },
    });

    // Open by default (D14), on Plan.
    const panel = page.getByRole('complementary', { name: 'Session panel' });
    await expect(panel.getByRole('tab', { name: 'Plan' })).toBeVisible();
    await expect(panel.getByText('Pushing the branch', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('session-panel-plan-open.png') });

    await panel.getByRole('button', { name: 'Close the session panel' }).click();
    const rings = page.getByRole('button', { name: /^Plan, 0 of 1 done/ });
    await expect(rings).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('session-panel-strip.png') });

    await rings.click();
    await expect(panel.getByText('Push the branch', { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('an edit lands in Changed in this session with its mark', async ({}, testInfo) => {
  const home = testInfo.outputPath('home');
  const projects = join(home, '.claude', 'projects', claudeProjectDir(REAL_DIRECTORY));
  mkdirSync(projects, { recursive: true });
  const target = join(REAL_DIRECTORY, 'package.json');
  writeFileSync(
    join(projects, `${TRANSCRIPT_UUID}.jsonl`),
    JSON.stringify({
      type: 'user',
      toolUseResult: {
        filePath: target,
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['+a', '-b'] }],
      },
    }) + '\n',
  );

  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const app = await launchHive({
    userDataDir: testInfo.outputPath('user-data'),
    configPath,
    env: { HOME: home },
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');
    const session = await startRoundTwoSession(page);
    const marker = testInfo.outputPath('posted-edit.txt');
    await shell(
      page,
      session,
      postHookCommand(
        {
          session_id: TRANSCRIPT_UUID,
          cwd: REAL_DIRECTORY,
          tool_name: 'Edit',
          tool_input: { file_path: target },
          tool_response: { ok: true },
        },
        marker,
      ),
    );
    await expectMarker(marker, '204');

    const panel = page.getByRole('complementary', { name: 'Session panel' });
    await panel.getByRole('tab', { name: /^Files/ }).click();
    const changed = panel.getByRole('region', { name: 'Changed in this session' });
    await expect(changed).toBeVisible({ timeout: 15_000 });
    await expect(changed.getByText('package.json')).toBeVisible();
    await expect(changed.getByText('+1 −1')).toBeVisible();
    await expect(panel.getByRole('tab', { name: 'Files 1' })).toBeVisible();
    await expect(panel.getByRole('img', { name: 'modified this session' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('session-panel-files.png') });
  } finally {
    await app.close();
  }
});

test('open and closed survive a relaunch', async ({}, testInfo) => {
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const userDataDir = testInfo.outputPath('user-data');

  let app = await launchHive({ userDataDir, configPath });
  let page = await app.firstWindow();
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');
    await startRoundTwoSession(page);
    await page.getByRole('button', { name: 'Close the session panel' }).click();
    await expect(page.getByRole('tablist')).toHaveCount(0);
  } finally {
    await app.close();
  }

  app = await launchHive({ userDataDir, configPath });
  page = await app.firstWindow();
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');
    await startRoundTwoSession(page);
    const panel = page.getByRole('complementary', { name: 'Session panel' });
    await expect(panel.getByRole('button', { name: 'Files' })).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Files' }).click();
    await expect(page.getByRole('tablist')).toBeVisible();
  } finally {
    await app.close();
  }

  app = await launchHive({ userDataDir, configPath });
  page = await app.firstWindow();
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');
    await startRoundTwoSession(page);
    await expect(page.getByRole('tablist')).toBeVisible();
  } finally {
    await app.close();
  }
});
