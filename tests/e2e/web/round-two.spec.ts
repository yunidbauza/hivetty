import { expect, test, type Page } from '@playwright/test';

/**
 * Round two's frame in a real browser (HIVE-195). It is the default layout
 * (HIVE-213), so a fresh profile boots straight into it.
 */
const bar = (page: Page) => page.getByRole('navigation', { name: 'Places' });
const place = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const panel = (page: Page) => page.getByRole('region', { name: / list$/ });

test.beforeEach(async ({ page }) => {
  await page.goto('/?sim=0');
});

test('opens on Home with no list panel', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await expect(place(page, 'Home')).toHaveAttribute('aria-current', 'page');
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
});

test('Home with no project is the first-run page, and Integrations opens Settings there', async ({ page }) => {
  const home = page.getByRole('region', { name: 'Home' });
  await expect(page.getByRole('heading', { name: 'An empty hive' })).toBeVisible();
  for (const name of ['Add a project', 'Integrations', 'New session']) {
    await expect(home.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(home.getByRole('button', { name: 'New session', exact: true })).toBeDisabled();
  await home.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Integrations', level: 2 })).toBeVisible();
});

/*
  No list without items (HIVE-211): the browser target has no project, no Jira,
  no gh and no agent, so every place draws no panel and its stage says why. A
  place with a list, the rail chord and the narrow overlay are proved in a real
  window, with a project configured: `tests/e2e/electron/list-panel.spec.ts`.
*/
test('each place with nothing to list draws no panel, and its stage says why (HIVE-211)', async ({ page }) => {
  for (const [name, heading] of [
    ['Work', "Jira isn't connected"],
    ['Agents', 'No agents yet'],
    ['PRs', "Pull requests aren't available here"],
  ] as const) {
    await place(page, name).click();
    await expect(place(page, name)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  }
});

test('Work with no Jira shows the not-connected page and no list (HIVE-211)', async ({ page }) => {
  await place(page, 'Work').click();
  await expect(page.getByRole('heading', { name: "Jira isn't connected" })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Work list' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect Jira' }).click();
  await expect(page.getByRole('heading', { name: 'Integrations', level: 2 })).toBeVisible();
});

test('Sessions with no project shows the Overmind and no panel, and the filter narrows it', async ({ page }) => {
  await place(page, 'Sessions').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overmind' })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('radio', { name: 'Ended' }).click();
  await expect(page.getByRole('radio', { name: 'Ended' })).toBeChecked();
  await page.getByRole('radio', { name: 'All' }).click();
  await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
});

test('PRs on the bar opens the place, and the stage says why there is no list (HIVE-211)', async ({ page }) => {
  await place(page, 'PRs').click();
  await expect(place(page, 'PRs')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'PRs list' })).toHaveCount(0);
  // The browser target has no `gh`: main's sentence is the body, and there is no terminal to open.
  await expect(page.getByText(/need the desktop app/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a terminal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
});

test('no inbox pill with nothing waiting (HIVE-198)', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Inbox, / })).toHaveCount(0);
});

test('round two has no header; the bar foot reads Demo in amber and says why (HIVE-196)', async ({ page }) => {
  await expect(bar(page)).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);

  const item = page.getByTestId('connection-item');
  await expect(item).toHaveText('Demo');
  await expect(item).toHaveClass(/text-amber/);
  await item.click();
  await expect(page.getByRole('dialog', { name: 'Connection' })).toContainText(
    'Real sessions need the desktop app.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Connection' })).toHaveCount(0);
});

test('Settings opens from the bar, and Mode still switches the theme (HIVE-196)', async ({ page }) => {
  await bar(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Dark' }).click();
  // Dark carries no `data-theme`: `:root` is dark (terminal-theme.spec.ts).
  await expect(page.locator('body')).not.toHaveAttribute('data-theme', /.*/);
});
