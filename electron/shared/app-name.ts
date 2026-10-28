/**
 * The app's one name (HIVE-326). It used to be two names, `The Hive`
 * underneath and a two-word display name on screen, until the identity itself moved to
 * HiveTTY.
 *
 * Changing it is not cosmetic:
 * - `app.setName` takes it, and `userData` is derived from it
 *   (`~/Library/Application Support/HiveTTY`): the window state, the hook
 *   settings, the session history, the generated plugin every session loads.
 * - Electron names the Keychain item that `safeStorage` encrypts with after
 *   it, so stored credentials are readable only under it.
 * - `productName` in `electron-builder.yml` is the same string. It names the
 *   bundle (`HiveTTY.app`), its executable and its helper apps.
 *
 * `behiques/hivetty` builds as `HiveTTY Pro` (HIVE-350), so the two apps share
 * none of these on one Mac. See "The app's name" in
 * `docs/packaging-and-updates.md`.
 */
export const APP_NAME = 'HiveTTY';

/**
 * The unpackaged build's `userData` folder name. Not `hivetty`: APFS is
 * case-insensitive, so that is the packaged `HiveTTY` folder, and a dev run
 * would share its single-instance lock and state.
 */
export const DEV_USER_DATA_NAME = 'hivetty-dev';
