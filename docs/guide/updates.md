# Updates

HiveTTY updates itself, but never without asking.

**On this page:** [Automatic updates](#automatic-updates) · [Check by hand](#check-by-hand) ·
[Update from the command line](#update-from-the-command-line) ·
[Cutting a release](#cutting-a-release)

## Automatic updates

- The app checks 30 seconds after launch, then every 6 hours. When there is nothing new, you
  hear nothing.
- A new version raises one inbox card per version. Nothing downloads until you say yes, and
  nothing installs until a second yes.
- A server ([Remote](remote.md)) downloads on its own and installs once no session or agent run
  is live.
- A build without a Developer ID signature cannot install itself; its card opens the release
  page instead.

## Check by hand

The app menu's **Check for Updates…**, or **Settings › Advanced › Updates › Check now**. Every
outcome gets a dialog.

## What's new

After an update to a new major version, or a minor we chose to highlight, the app opens a
three-slide **What's new** card once the splash has closed and the window has painted. Back
and Next (or ← and →) walk it, Esc or × closes it, and it never shows twice for the same
version. Tick **Don't show What's new again** to stop future ones. **Settings › Advanced ›
What's new** turns them back on and opens the latest card at any time. A first launch shows
the first-run page instead. Patch releases never show a card.

## Update from the command line

Useful over SSH on a server Mac:

```sh
the-hive --update
```

| Exit | Meaning |
| --- | --- |
| 0 | downloaded, install started |
| 1 | failed, with the reason |
| 2 | already current |
| 3 | no update channel; prints where to download |
| 4 | a newer version needs a manual install |
| 5 | refused while the local server is running |

On a server, stop the LaunchAgent, update, then start it again:

```sh
launchctl bootout gui/$(id -u)/com.behiques.hivetty.server
the-hive --update
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.behiques.hivetty.server.plist
```

`the-hive` is a small shim for the app binary; [Server mode](../server-mode.md) shows how to
install it.

## Cutting a release

For maintainers:

```sh
pnpm version minor
git push --follow-tags
```

A new major (`pnpm version major`) needs its What's new entry in
`src/features/whats-new/releases.ts` first; the release test fails without one. A minor gets
a card only if you add an entry for it.

The tag runs CI (lint, type-check, test, build) and publishes the `.dmg`, the `.zip` the
updater uses, and `latest-mac.yml`. Never move a published tag. The details are in
[Packaging and updates](../packaging-and-updates.md).
