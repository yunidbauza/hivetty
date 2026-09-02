import type { Locator } from '@playwright/test';

/**
 * Select a rail tab without risking a collapse.
 *
 * Clicking a rail tab that is already active now toggles the rail collapsed
 * — one of the three ways to collapse it (VS Code's gesture). Most specs that
 * click a tab are doing it as setup: "make sure this panel is showing," not
 * "prove that clicking selects it." A plain `.click()` is not safe for that
 * anymore, because the tab may already be the active one (most rails default
 * to a tab other than the one a test wants), and clicking it would collapse
 * the rail and unmount the very panel the test is about to assert on.
 *
 * `aria-selected` is the honest source of truth for "already showing" — this
 * clicks only when it isn't already `"true"`, which is idempotent the way the
 * old plain click used to look.
 */
export async function selectRailTab(tab: Locator): Promise<void> {
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
}
