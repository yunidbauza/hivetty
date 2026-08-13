# Packaging and updates

How The Hive becomes something you install, how a new version gets published,
and how a running copy finds out about it.

Load this when working on `electron-builder.yml`, `.github/workflows/release.yml`,
`electron/main/updates/**`, or anything to do with the app's version or name.

## Cutting a release

```bash
pnpm version minor        # writes package.json and creates the tag v0.2.0
git push --follow-tags
```

The tag is the trigger; `package.json`'s version is the source of truth.
`pnpm version` writes both in one step, which is the only reason they cannot
disagree — electron-builder reads the version out of `package.json` and never
looks at the tag.

CI then runs `lint`, `type-check` and `test` before it builds anything, and
publishes three assets to a GitHub Release:

| Asset | For |
| --- | --- |
| `The Hive-<v>-arm64.dmg` | A human downloading the app. |
| `The Hive-<v>-arm64-mac.zip` | **The updater.** Squirrel.Mac swaps a zip, never a dmg. |
| `latest-mac.yml` | How a running app learns a newer version exists, and its SHA-512. |

**Never move a published tag.** `latest-mac.yml` pins a checksum per asset, so
re-cutting a release under the same tag fails the integrity check on any client
that is mid-download. `workflow_dispatch` exists for rebuilds.

## What is in the bundle, and one thing that is not

`asarUnpack` pulls `node-pty` out of the archive. This is not an optimisation —
it is the difference between a working app and one that opens no terminals.
`node-pty` *spawns* a helper executable by path, and a path inside `app.asar` is
not a path `posix_spawn` can execute: asar is a virtual filesystem Electron's
`fs` shims understand and the kernel does not. Packed, the app launches
perfectly and throws `posix_spawnp failed` the first time anyone opens a
terminal.

Unpacking also preserves the executable bit, which matters because the published
`node-pty` tarball ships `spawn-helper` at `0644`. `scripts/check-native-abi.mjs
--fix` repairs that at install time — so it must run *before* packaging, which
is why CI's build step comes after a plain `pnpm install` rather than an
`--ignore-scripts` one.

## The app's name

The screenshot that started this: the menu bar read **Electron**, and the
submenu read **About the-hive**. Those are two different bugs.

| What you see | Where it comes from | Fixed by |
| --- | --- | --- |
| Leftmost menu title | `CFBundleName` in the **running bundle's** `Info.plist` | `productName` in `electron-builder.yml` |
| `About …`, `Quit …` | `app.getName()`, falling back to `package.json`'s `name` | `app.setName('The Hive')` |

`app.setName` cannot fix the first. Under `pnpm desktop:dev` the running bundle
is `node_modules/electron/dist/Electron.app`, and macOS reads that title from
the bundle before any JavaScript runs. **Dev will always say `Electron`, and the
packaged app says `The Hive`.** Patching Electron's `Info.plist` from a
postinstall would make dev *look* right while changing nothing that ships; it is
deliberately not done.

`setName` moves `userData`, so `electron/main/index.ts` pins the development
path back to `the-hive`. That keeps the encrypted Jira credential and the window
state where they already are, and — more usefully — keeps a development run and
the installed app as two separate instances that can run side by side. Sharing
one `userData` would make `requestSingleInstanceLock` treat them as the same app.

## Updating

Two entry points, one code path, two ways of answering:

- **Background** — thirty seconds after launch, then every six hours. Silent
  when there is nothing. Raises an `app.update_available` Inbox row when there
  is, keyed on the *version* so six-hourly checks cannot re-announce one release.
- **"Check for Updates…"** (app menu, and the button in Settings → Advanced) —
  a human asked, so every outcome gets a dialog, including "You're up to date".
  A found release gets a confirm dialog rather than an Inbox row; the user is
  right there.

Nothing downloads without a yes (`autoDownload: false`) and nothing installs
without a second one (`autoInstallOnAppQuit: false`). The second flag matters
more than it looks: left at its default, an update the user declined would swap
itself in at the next quit — including a quit caused by a crash.

### The ad-hoc signature problem

**This is the load-bearing constraint, and it is not solved.**

There is no Apple Developer ID for this project, so the bundle is ad-hoc signed
(`scripts/adhoc-sign.mjs`). Ad-hoc is the floor rather than a choice: Apple
Silicon refuses to execute an unsigned binary at all.

Squirrel.Mac — which is what Electron's `autoUpdater` is, and what
`electron-updater` drives on macOS — verifies an update against the running
app's **designated requirement**. For a Developer ID signature that requirement
names the certificate, and it holds across every build you ever sign. For an
ad-hoc signature the designated requirement is the binary's `cdhash`, which is a
hash of that exact build. Version 0.1.1 has a different cdhash from 0.1.0 by
construction, so it cannot satisfy 0.1.0's requirement.

No amount of *correct* ad-hoc signing changes this. It is a property of what an
ad-hoc signature means.

So the app carries two paths and picks on evidence:

1. `probeUpdateCapability()` reads the bundle's own signature with `codesign`.
   A Developer ID is `self-install`. Ad-hoc is `self-install` but **`unverified`**
   — allowed to try. Unsigned, or `codesign` unavailable, is `manual`.
2. An `unverified` build attempts the download. On macOS the signature check
   happens during *staging*, not at install, which is why `engine.ts` waits for
   `update-downloaded` rather than resolving when `downloadUpdate()` does — that
   is what makes the refusal observable at all.
3. A refusal calls `demoteToManual`. The capability becomes `manual` for the rest
   of the session, the reason is recorded for the Settings pane, and the click
   opens the release page. **A failed self-install costs a click, not the
   feature.**

If a Developer ID ever appears, nothing in the app changes: the probe reads the
new signature and the first path starts working.

### Gatekeeper

Quarantine is applied by whatever *downloads* a file. A dmg pulled from a
browser is quarantined, and an unsigned app inside it is refused with "damaged
and can't be opened" — which is a lie, but a load-bearing one. The escape:

```bash
xattr -dr com.apple.quarantine "/Applications/The Hive.app"
```

An update the app fetches itself is not quarantined, which is a real argument
for the in-app path even while the swap is refused.

## Where the code lives

| File | Owns |
| --- | --- |
| `electron/shared/update-contract.ts` | Types, the release URLs, the two intervals. Imported type-only by the renderer. |
| `electron/main/updates/capability.ts` | The `codesign` probe and the demotion. |
| `electron/main/updates/updater.ts` | Every decision. Imports no Electron and no `electron-updater`, which is what makes it testable. |
| `electron/main/updates/engine.ts` | The only file that touches `electron-updater`. |
| `electron/main/updates/index.ts` | The singleton, the dialogs, the wiring. |

`autoUpdater` is read **inside** `createElectronUpdaterEngine`, never at module
scope. It is a lazy getter that constructs a `MacUpdater` on first access, which
reads `app.getVersion()` on the spot — at module scope that ran at import time
and broke three unrelated test suites with `Cannot read properties of undefined
(reading 'getVersion')` from inside `ElectronAppAdapter`.
