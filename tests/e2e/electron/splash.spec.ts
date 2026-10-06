import { expect, test } from '@playwright/test';

import { SPLASH_MIN_MS, SPLASH_SIZE } from '../../../electron/shared/splash';

import { launchHive, mainWindow, splashWindow, writeProjectConfig } from './fixtures/hive-app';

/**
 * The Overmind Chamber, driven in the built app.
 *
 * The only spec in the suite that launches **without** `HIVE_E2E`. Every other
 * one sets it, which turns the splash off so twenty-five specs do not each wait
 * out the floor and then have to work out which of two windows is the app. That
 * makes this the one place the real cold-start path is exercised, so it asserts
 * the whole of it rather than just that a window appeared.
 *
 * What a unit test cannot reach, and this can: that the document loads at all,
 * that the globe draws pixels, and that the app window is genuinely hidden
 * behind the splash rather than merely scheduled to appear later.
 */

test.describe('the cold-start splash', () => {
  test('covers the boot, then hands over to the app', async ({}, testInfo) => {
    const configPath = testInfo.outputPath('hive-config.json');
    writeProjectConfig(configPath, { id: 'hive', path: testInfo.outputPath('repo') });

    const started = Date.now();
    const app = await launchHive({
      userDataDir: testInfo.outputPath('user-data'),
      configPath,
      /**
       * Cleared, not absent. `launchHive` sets `HIVE_E2E: '1'` and merges this
       * after it, and `splashEnabled` treats the empty string as "not set" —
       * which is the whole reason it tests truthiness rather than presence.
       */
      env: { HIVE_E2E: '' },
    });

    try {
      const splash = await test.step('the splash appears', async () => {
        await expect
          .poll(() => splashWindow(app) !== undefined, { timeout: 15_000 })
          .toBe(true);
        const page = splashWindow(app);
        if (!page) throw new Error('the splash went before it could be inspected');
        await page.waitForLoadState('domcontentloaded');
        return page;
      });

      await test.step('it is the chamber, at the size both processes agree on', async () => {
        await expect(splash.locator('.chamber')).toBeVisible();
        await expect(splash.locator('.wordmark')).toHaveText(/HIVE\s*tty/);
        await expect(splash.locator('.log li')).toHaveCount(5);
        await expect(splash.locator('.log li.online')).toHaveText('hive cluster online');

        const size = await splash.evaluate(() => ({
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        }));
        expect(size).toEqual({ width: SPLASH_SIZE.width, height: SPLASH_SIZE.height });
      });

      await test.step('the globe is drawn, not missing', async () => {
        /**
         * Polled: the cells drift in from 0.35s, so a single early read would
         * see a nearly empty canvas that is correct a moment later.
         *
         * Painted pixels inside the globe's disc, and none in the left third of
         * the chamber, which the copy owns and the orbit (radius 171 about
         * x = 660) never reaches. The canvas is transparent there, so an
         * opaque ground painted by mistake fails this as surely as an empty
         * globe does.
         */
        const drawn = async () =>
          splash.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('#globe');
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return false;
            const k = canvas.width / 960;
            const painted = (x: number, y: number, w: number, h: number): number => {
              const { data } = ctx.getImageData(x * k, y * k, w * k, h * k);
              let n = 0;
              for (let i = 3; i < data.length; i += 4) if (data[i] > 20) n += 1;
              return n / (data.length / 4);
            };
            return painted(600, 216, 120, 120) > 0.2 && painted(0, 0, 300, 600) === 0;
          });

        await expect.poll(drawn, { timeout: 5_000 }).toBe(true);
      });

      await test.step('the app window stays hidden underneath it', async () => {
        const visible = await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((win) => ({
            url: win.webContents.getURL(),
            visible: win.isVisible(),
          })),
        );
        const main = visible.find((win) => !win.url.includes('splash.html'));
        expect(main?.visible).toBe(false);
      });

      await test.step('it holds the floor, then goes', async () => {
        await expect
          .poll(() => splashWindow(app) === undefined, { timeout: 20_000 })
          .toBe(true);

        // Generous on the lower bound: the floor is counted from when the
        // splash was shown, which is necessarily after the process started.
        expect(Date.now() - started).toBeGreaterThan(SPLASH_MIN_MS * 0.8);
      });

      await test.step('the app is now on screen', async () => {
        const page = await mainWindow(app);
        await expect(page.locator('#root')).toBeVisible();
        const visible = await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((win) => win.isVisible()),
        );
        expect(visible).toEqual([true]);
      });
    } finally {
      await app.close();
    }
  });
});
