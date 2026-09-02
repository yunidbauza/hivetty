import { expect, test } from '@playwright/test';

/**
 * A rail collapses to a 44px icon strip and gives its width back to the
 * terminal (HIVE rail-collapse plan, task 10).
 *
 * Every other claim in this feature is provable in `happy-dom` — the store
 * flips a boolean, the rail paints at 44px, the tab strip swaps its markup.
 * What `happy-dom` cannot show is that the terminal *noticed*: it performs no
 * layout, so xterm is never instantiated for real there (AGENTS.md), and a
 * unit test can only assert what `--cc-rail-w-left` was set to, never what the
 * stage actually measures. This is the one spec that closes that gap — a real
 * browser, a real xterm, a real `.xterm-screen` that has to get wider.
 */
test('collapsing the left rail gives its width to the terminal', async ({ page }) => {
  await page.goto('/?sim=0');

  const rail = page.getByRole('navigation', { name: 'Projects, work, and agents' });
  await expect(rail).toBeVisible();
  await expect(rail).toHaveCSS('width', /^\d{3}px$/);

  const screenEl = page.locator('.xterm-screen').first();
  await expect(screenEl).toBeVisible();
  const before = await screenEl.evaluate((el) => el.clientWidth);

  // The left rail's default tab is `projects` (ui-store), so clicking it while
  // it is already active is what collapses the rail rather than reselecting it.
  await page.getByRole('tab', { name: /Projects/ }).click();

  await expect(rail).toHaveCSS('width', '44px');

  await expect
    .poll(() => screenEl.evaluate((el) => el.clientWidth))
    .toBeGreaterThan(before);
});

test('the collapsed rail still opens a panel when a strip icon is clicked', async ({
  page,
}) => {
  await page.goto('/?sim=0');

  const rail = page.getByRole('navigation', { name: 'Projects, work, and agents' });

  await page.getByRole('tab', { name: /Projects/ }).click();
  await expect(rail).toHaveCSS('width', '44px');

  // Regex, not an exact string: this tab carries a badge count for asks
  // waiting on an answer, and its accessible name in the collapsed strip
  // includes that count when it is non-zero.
  await page.getByRole('tab', { name: /Agents/ }).click();

  // Scoped to the left rail: the activity rail on the right renders its own
  // `tabpanel` at the same time, and an unscoped query would hit both.
  await expect(rail.getByRole('tabpanel')).toBeVisible();
  await expect(rail).not.toHaveCSS('width', '44px');
});

/**
 * A collapsed rail's icon strip loses every visible label — the whole reason
 * `TabBar` gives each strip button an `aria-label` (`stripName`) in the first
 * place. A tooltip is what gets that name back under a pointer, and Radix
 * positions it through a portal and drives it on real pointer/timer
 * behaviour, which `happy-dom` cannot lay out — see the unit tests in
 * `tab-bar.test.tsx` for the plumbing this closes the gap on: the strip
 * button really is a tooltip trigger, and the tooltip's text really is
 * `stripName`.
 */
test('hovering a collapsed strip icon shows its label as a tooltip', async ({ page }) => {
  await page.goto('/?sim=0');

  const rail = page.getByRole('navigation', { name: 'Projects, work, and agents' });

  // The left rail's default tab is `projects`; clicking it while active
  // collapses the rail (same gesture as the first test above).
  await page.getByRole('tab', { name: /Projects/ }).click();
  await expect(rail).toHaveCSS('width', '44px');

  await rail.getByRole('tab', { name: /Work/ }).hover();

  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/Work/);
});

/**
 * The activity rail sits on the right edge of the window. `left-rail.tsx`
 * passes `tooltipSide="right"` and `activity-rail.tsx` passes
 * `tooltipSide="left"` for exactly this reason: a tooltip opening the same
 * direction on both rails would run one of them off-screen. That is a claim
 * about *position*, not just presence, so it belongs here rather than in
 * `tab-bar.test.tsx` — happy-dom has no layout to get it wrong or right in.
 */
test('the activity rail opens its strip tooltip inward, away from the screen edge', async ({
  page,
}) => {
  await page.goto('/?sim=0');

  const rail = page.getByRole('complementary', { name: 'Activity' });

  // The activity rail's default tab is `inbox`; clicking it while active
  // collapses the rail, same gesture as the left rail.
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await expect(rail).toHaveCSS('width', '44px');

  const trigger = rail.getByRole('tab', { name: /Explorer/ });
  await trigger.hover();

  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/Explorer/);

  const triggerBox = (await trigger.boundingBox())!;
  const tooltipBox = (await tooltip.boundingBox())!;

  // Opened leftward: the tooltip sits to the left of its trigger, not to the
  // right — where it would run past the window's right edge.
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(triggerBox.x + 1);
  // And it never leaves the viewport on the side it opened toward.
  expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
});
