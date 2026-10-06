import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
import { goToOvermind, overmindNewSession } from '../fixtures/places';
import { launchHive } from './fixtures/hive-app';

/**
 * Home's comb in the real app (HIVE-199).
 *
 * Three sessions on one project, each driven into a state by hook posts from
 * its own shell, the way a session posts its task tools: one
 * working, one waiting, one idle. What only a real window can show is the
 * canvas itself — that it lays the patch out where the layout says, that a
 * hover over it finds the cell, and what it looks like in both themes, which
 * the screenshots keep as artifacts.
 *
 * Unseeded, so no shipped agents: the swarm is empty and the project's patch
 * is the only one. Reduced motion is emulated, so the canvas holds one still
 * frame and the screenshots are of a picture, not of a moment in a loop.
 */

const REAL_DIRECTORY = join(import.meta.dirname, '../../..');
const PROJECT = 'nova-web';

function writeConfig(path: string, bootDir: string): void {
  writeFileSync(
    path,
    JSON.stringify({
      version: 2,
      shell: '/bin/sh',
      claudeCommand: `printf bootstrapped > '${bootDir}/boot-'"$${HOOK_ENV_SESSION}"; false`,
      projects: [{ id: PROJECT, name: PROJECT, path: REAL_DIRECTORY, icon: 'ph-cube' }],
    }),
  );
}

const readMarker = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, 'utf8').trim() : null;

async function expectMarker(path: string, contents: string): Promise<void> {
  await expect.poll(() => readMarker(path), { timeout: 15_000 }).toBe(contents);
}

async function shell(page: Page, sessionId: string, command: string): Promise<void> {
  await page.evaluate(
    ([id, data]) => {
      window.hive!.pty.write({ sessionId: id!, data: data! });
    },
    [sessionId, `${command}\n`],
  );
}

/** One hook event, posted from the session's own shell with its own credentials. */
function postHookCommand(
  event: string,
  body: Record<string, unknown>,
  statusMarker: string,
): string {
  const payload = JSON.stringify({ hook_event_name: event, ...body });
  return (
    `curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST "$${HOOK_ENV_RECEIVER_URL}${HOOK_PATH}"` +
    ` -H "${HOOK_HEADER_SESSION}: $${HOOK_ENV_SESSION}"` +
    ` -H "${HOOK_HEADER_TOKEN}: $${HOOK_ENV_TOKEN}"` +
    ` -H "content-type: application/json"` +
    ` --data-binary '${payload}'` +
    ` > '${statusMarker}'`
  );
}

const places = (page: Page) => page.getByRole('navigation', { name: 'Places' });

const terminalIds = (page: Page): Promise<string[]> =>
  page
    .locator('[data-terminal-id^="sess-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-terminal-id') ?? ''));

/**
 * Start one session on the project through the unfiltered Overmind's New
 * session (the Sessions panel head's "+" adds a project now); answers its id.
 */
async function startSession(page: Page, bootDir: string): Promise<string> {
  const before = await terminalIds(page);
  await goToOvermind(page);
  await overmindNewSession(page).click();
  await expect(page.getByRole('textbox', { name: 'Search all projects' })).toBeFocused();
  await page.keyboard.type(PROJECT);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await terminalIds(page)).length).toBe(before.length + 1);
  const id = (await terminalIds(page)).find((each) => !before.includes(each));
  if (id === undefined) throw new Error('the spawned session has no terminal id');
  await expect(page.locator(`[data-terminal-id="${id}"]`)).toBeVisible();
  await expectMarker(join(bootDir, `boot-${id}`), 'bootstrapped');
  return id;
}

/** Two animation frames: the canvas has painted whatever the last change asked for. */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** The way a person switches mode in round two: Settings › Appearance › Mode. */
async function setMode(page: Page, mode: 'Light' | 'Dark'): Promise<void> {
  await places(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: mode }).click();
  await page.keyboard.press('Escape');
}

test('Home draws the comb: one cell per session, the headline, a hover, both themes', async ({}, testInfo) => {
  // Three sessions booted and a dozen hook posts: more than the default 30 s.
  test.setTimeout(120_000);
  const configPath = testInfo.outputPath('hive-config.json');
  const bootDir = testInfo.outputPath('.');
  writeConfig(configPath, bootDir);

  const app = await launchHive({
    userDataDir: testInfo.outputPath('user-data'),
    configPath,
    unseeded: true,
  });
  const page = await app.firstWindow();
  let posts = 0;
  const post = async (sessionId: string, event: string, body: Record<string, unknown> = {}) => {
    posts += 1;
    const marker = testInfo.outputPath(`posted-${String(posts)}.txt`);
    await shell(page, sessionId, postHookCommand(event, body, marker));
    await expectMarker(marker, '204');
  };
  const goHome = () => places(page).getByRole('button', { name: 'Home', exact: true }).click();

  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('nav[aria-label="Places"]');

    const working = await startSession(page, bootDir);
    await goHome();
    const waiting = await startSession(page, bootDir);
    await goHome();
    const idle = await startSession(page, bootDir);
    await goHome();

    await post(working, 'SessionStart');
    await post(working, 'UserPromptSubmit');
    await post(waiting, 'SessionStart');
    await post(waiting, 'UserPromptSubmit');
    // What raises the Summons row in the real app (HIVE-217's headline counts the
    // queue): the PermissionRequest. Its `permission_prompt` echo raises nothing.
    await post(waiting, 'PermissionRequest', { tool_name: 'Bash' });
    await post(waiting, 'Notification', { notification_type: 'permission_prompt' });
    await post(idle, 'SessionStart');
    await post(idle, 'Stop');

    await goHome();
    await expect(page.getByRole('heading', { level: 2, name: 'The hive is calling · 1 summons' })).toBeVisible();
    const cells = page.getByRole('list', { name: "The comb's cells" }).getByRole('button');
    await expect(cells).toHaveCount(3);
    await expect(cells.filter({ hasText: /Morphing · nova-web/ })).toHaveCount(1);
    await expect(cells.filter({ hasText: /Summons · nova-web/ })).toHaveCount(1);
    await expect(cells.filter({ hasText: /Burrowed · nova-web/ })).toHaveCount(1);

    // Reduced motion is emulated for this whole test: nothing on Home is running,
    // the arrival card (if one is up for the waiting session) included (HIVE-210).
    const running = () =>
      page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    await expect.poll(running).toBe(0);

    // The patch's first cell: column 2, row 7 at R 36, in the comb's logical space.
    // Named by the headline (#43): the mood, then the counts.
    const canvas = page.getByRole('img', { name: /^The hive is calling · 1 summons\. / });
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('the comb has no box');
    const k = box.width / 1376;
    const R = 36;
    const w = Math.sqrt(3) * R;
    await page.mouse.move(box.x + (2 * w + w / 2) * k, box.y + (7 * 1.5 * R + 14) * k);
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('nova-web');
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);

    // The palette comes from the appearance store, so the theme is switched
    // the way a person does it, not by editing the body attribute.
    const shoot = async (name: string) => {
      await settle(page);
      await page.screenshot({ path: testInfo.outputPath(`${name}-dark.png`) });
      await setMode(page, 'Light');
      await settle(page);
      await page.screenshot({ path: testInfo.outputPath(`${name}-light.png`) });
      await setMode(page, 'Dark');
    };
    await shoot('home-comb-needs');

    // A new prompt answers the block and the session works again. No Stop: a
    // finished turn is yours again, which is a summons since 6 Oct 2026.
    await post(waiting, 'UserPromptSubmit');
    await expect(page.getByRole('heading', { level: 2, name: 'The hive is humming' })).toBeVisible();
    await shoot('home-comb-calm');

    // Held still: two reads half a second apart are the same picture (HIVE-210).
    const comb = page.getByRole('img', { name: /^The hive is humming\. / });
    const frame = () => comb.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    const first = await frame();
    await page.waitForTimeout(500);
    expect(await frame()).toBe(first);
    expect(await running()).toBe(0);

    // In light, the canvas's own ground is the light stage colour (from the palette, not a hex).
    await setMode(page, 'Light');
    await settle(page);
    const corner = await comb.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return Array.from(c.getContext('2d')!.getImageData(2, 2, 1, 1).data.slice(0, 3));
    });
    expect(corner).toEqual([253, 253, 251]);
    await setMode(page, 'Dark');
  } finally {
    await app.close();
  }
});
