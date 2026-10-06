import { expect, test } from '@playwright/test';

import { bar, goToPlace } from '../fixtures/places';

/**
 * The Work place with nothing behind it, in a real browser.
 *
 * ## What this spec used to assert, and why it inverted
 *
 * It pinned the opposite: eight seeded tickets rendering in a target with no
 * Electron, no main process and no Jira, on the reasoning that fixtures *were*
 * the browser demo's data rather than a degraded mode.
 *
 * That framing is what produced the bug on the desktop side. The same seed
 * loaded there too, so the Work place painted eight sample tickets at boot and a
 * real Jira read replaced them a frame later — the user watched somebody else's
 * backlog turn into their own. The seed is gone from both targets, so the
 * browser's Work place is now honestly empty and says why.
 *
 * The load-bearing assertion is the negative one: no `GRAC-` key reaches the
 * DOM, in any state. A unit test can assert the store is empty; only this can
 * prove nothing paints it.
 */

const APP_URL = '/?sim=0';

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await page.waitForSelector('nav[aria-label="Places"]');
  await goToPlace(page, 'Work');
});

test('says there is no Jira connection instead of showing sample tickets', async ({
  page,
}) => {
  // A browser has no bridge, therefore no Jira. That is a configuration
  // answer, and the stage gives it rather than sitting blank.
  await expect(page.getByRole('heading', { name: "Jira isn't connected" })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Work list' })).toHaveCount(0);
});

test('paints no ticket at all', async ({ page }) => {
  const work = page.getByRole('main');

  await expect(work.locator('article')).toHaveCount(0);
});

/**
 * The regression guard for the whole change. If a seeded ticket ever finds its
 * way back into the store, this is what catches it — including the one-frame
 * flash, since a key that appears and vanishes still appears.
 */
test('never renders a seeded ticket key', async ({ page }) => {
  await expect(page.getByText(/GRAC-\d+/)).toHaveCount(0);
  await expect(
    page.getByText('Hero refresh: migrate to semantic tokens'),
  ).toHaveCount(0);
});

test('the Work place shows no count', async ({ page }) => {
  await expect(bar(page).getByRole('button', { name: 'Work', exact: true })).toBeVisible();
});

/**
 * The states that belong to a *desktop* read must not leak into a browser,
 * where they would name a failure that did not happen.
 */
test('claims neither staleness nor an empty query result', async ({ page }) => {
  const work = page.getByRole('main');

  await expect(work.getByText(/may be out of date/i)).toHaveCount(0);
  await expect(work.getByText(/No issues matched/i)).toHaveCount(0);
  await expect(work.getByRole('button', { name: /try again/i })).toHaveCount(0);
});
