import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  HOOK_ENV_RECEIVER_URL,
  HOOK_ENV_SESSION,
  HOOK_ENV_TOKEN,
  HOOK_HEADER_SESSION,
  HOOK_HEADER_TOKEN,
} from '../../../electron/shared/hook-contract';
import { LEDGER_POST_PATH } from '../../../electron/shared/ledger-contract';

import { launchHive, resizeTo, writeProjectConfig } from './fixtures/hive-app';

/**
 * HIVE-223: a stage the rails cannot crush. Electron only, because only a real
 * window crosses 1,200px and only a real session draws the session panel.
 */
const PROJECT = 'nova-web';
const REAL_DIRECTORY = join(import.meta.dirname, '../../..');
const STAGE_MIN = 520;
const LIST = 'section[aria-label="Sessions list"]';
const SESSION = 'aside[aria-label="Session panel"]';

const width = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().width);
const valueNow = (page: Page, name: string) => page.getByRole('slider', { name }).getAttribute('aria-valuenow');

test('saved wide rails yield to the stage floor at 1,200px, and come back at 1,440px', async ({}, testInfo) => {
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const app = await launchHive({ userDataDir: testInfo.outputPath('user-data'), configPath });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('nav[aria-label="Places"]');
    // Saved at their maxima, as a person who widened both on a big screen would have them.
    await page.evaluate(() => {
      const raw = localStorage.getItem('hive.appearance');
      const saved =
        raw === null
          ? { state: {}, version: 4 }
          : (JSON.parse(raw) as { state: Record<string, unknown>; version: number });
      saved.state = { ...saved.state, listPanelWidth: 400, sessionPanelWidth: 480, sessionPanelOpen: true };
      localStorage.setItem('hive.appearance', JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Places"]');
    // Both rails draw side by side only from 1,200px.
    await resizeTo(app, page, 1440);
    // A session started from the Sessions place keeps its list beside the stage, as session-panel.spec does.
    await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Sessions', exact: true }).click();
    await page.locator(LIST).getByRole('button', { name: new RegExp(`^${PROJECT}`) }).click();
    await page.getByRole('main').getByRole('button', { name: `New session in ${PROJECT}`, exact: true }).click();
    await expect(page.locator('[data-terminal-id^="sess-"]').last()).toBeVisible();
    await expect(page.locator(LIST)).toBeVisible();
    await expect(page.locator(SESSION)).toBeVisible();

    await expect.poll(() => width(page, 'main')).toBeGreaterThanOrEqual(STAGE_MIN - 1);
    const wideList = await width(page, LIST);
    const wideSession = await width(page, SESSION);
    const wideListNow = await valueNow(page, 'Resize the list panel');
    const wideSessionNow = await valueNow(page, 'Resize the session panel');

    await resizeTo(app, page, 1200);
    await expect.poll(() => width(page, 'main')).toBeGreaterThanOrEqual(STAGE_MIN - 1);
    expect(await width(page, LIST)).toBeLessThan(wideList);
    expect(await width(page, SESSION)).toBeLessThan(wideSession);
    // The grips follow the drawn rails, not the saved widths.
    await expect.poll(() => valueNow(page, 'Resize the list panel')).not.toBe(wideListNow);
    await expect.poll(() => valueNow(page, 'Resize the session panel')).not.toBe(wideSessionNow);

    // The saved widths were a preference, not rewritten: widening gives them back.
    await resizeTo(app, page, 1440);
    await expect.poll(() => width(page, LIST)).toBeCloseTo(wideList, 0);
    await expect.poll(() => width(page, SESSION)).toBeCloseTo(wideSession, 0);
  } finally {
    await app.close();
  }
});

const readMarker = (path: string): string | null => (existsSync(path) ? readFileSync(path, 'utf8').trim() : null);

async function shell(page: Page, sessionId: string, command: string): Promise<void> {
  await page.evaluate(
    ([id, data]) => {
      window.hive!.pty.write({ sessionId: id!, data: data! });
    },
    [sessionId, `${command}\n`],
  );
}

/** An ask posted from the session's own shell, as `inbox-pill.spec.ts` posts one. */
function postAskCommand(body: string, statusMarker: string): string {
  const payload = JSON.stringify({ to: 'overmind', kind: 'ask', body, meta: { options: ['yes', 'no'] } });
  return (
    `curl -sS -m 5 -o /dev/null -w '%{http_code}' -X POST "$${HOOK_ENV_RECEIVER_URL}${LEDGER_POST_PATH}"` +
    ` -H "${HOOK_HEADER_SESSION}: $${HOOK_ENV_SESSION}"` +
    ` -H "${HOOK_HEADER_TOKEN}: $${HOOK_ENV_TOKEN}"` +
    ` -H "content-type: application/json"` +
    ` --data-binary '${payload}'` +
    ` > '${statusMarker}'`
  );
}

const rect = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });

async function expectInsideStage(page: Page, inner: Locator): Promise<void> {
  const stage = await rect(page.getByRole('main'));
  const box = await rect(inner);
  expect(box.left).toBeGreaterThanOrEqual(stage.left - 0.5);
  expect(box.right).toBeLessThanOrEqual(stage.right + 0.5);
}

test('at the stage floor the session header and an arrival card stay inside the stage, and an ending leaves it (HIVE-225)', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const configPath = testInfo.outputPath('hive-config.json');
  writeProjectConfig(configPath, { id: PROJECT, path: REAL_DIRECTORY });
  const app = await launchHive({ userDataDir: testInfo.outputPath('user-data'), configPath });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('nav[aria-label="Places"]');
    // Both rails at their default widths, the session panel open.
    await page.evaluate(() => {
      const raw = localStorage.getItem('hive.appearance');
      const saved =
        raw === null
          ? { state: {}, version: 4 }
          : (JSON.parse(raw) as { state: Record<string, unknown>; version: number });
      saved.state = { ...saved.state, sessionPanelOpen: true };
      localStorage.setItem('hive.appearance', JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForSelector('nav[aria-label="Places"]');
    await resizeTo(app, page, 1200);

    await page.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Sessions', exact: true }).click();
    await page.locator(LIST).getByRole('button', { name: new RegExp(`^${PROJECT}`) }).click();
    await page.getByRole('main').getByRole('button', { name: `New session in ${PROJECT}`, exact: true }).click();
    const terminal = page.locator('[data-terminal-id^="sess-"]').last();
    await expect(terminal).toBeVisible();
    const session = await terminal.getAttribute('data-terminal-id');
    if (session === null) throw new Error('the spawned session has no terminal id');
    await expect(page.locator(SESSION)).toBeVisible();
    await expect.poll(() => width(page, 'main')).toBeGreaterThanOrEqual(STAGE_MIN - 1);

    // The header: nothing scrolls sideways, and ⋯ sits inside its box.
    const header = page.getByTestId('session-header');
    expect(await header.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    const headerBox = await rect(header);
    const menuBox = await rect(page.getByRole('button', { name: 'Session menu' }));
    expect(menuBox.right).toBeLessThanOrEqual(headerBox.right + 0.5);

    // An arrival card, with the keyboard off the terminal so it rises; hovered so it does not fold.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const marker = testInfo.outputPath('posted-1.txt');
    await shell(page, session, postAskCommand('Run the ledger tests?', marker));
    await expect.poll(() => readMarker(marker), { timeout: 15_000 }).toBe('200');
    const card = page.getByRole('article', { name: /^Ask from / });
    await expect(card).toBeVisible();
    await card.hover();
    await expectInsideStage(page, page.getByTestId('arrival-stack'));

    /*
      The session ends: the stage goes to the Overmind (#107) with no ended
      card. The card is left only for a session that ended while its editor
      was up, which no ended row can be opened to reach (HIVE-93).
    */
    await page.mouse.move(0, 0);
    await shell(page, session, 'exit');
    await expect(page.getByTestId('session-header')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Session ended' })).toHaveCount(0);
    await expect(page.getByTestId('session-row').filter({ hasText: session })).toHaveCount(1);
  } finally {
    await app.close();
  }
});
