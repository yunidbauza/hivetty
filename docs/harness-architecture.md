# Harness architecture

A **harness** is the CLI that drives an agent session. HiveTTY speaks to it through a
port, so that Claude Code is the first adapter rather than an assumption spread through
main. Epic HIVE-232 is phase 1; HIVE-233 built the skeleton this doc describes, and each
later story fills in its section.

## Phase 1: no behaviour change

Phase 1 moves Claude-specific code behind the port without changing what it does. Claude
Code stays fully functional, exactly as before. Existing tests keep their assertions; a
test may move to mirror a moved file, and any changed assertion is called out in its PR
with why it is not a behaviour change.

## The pieces

| Piece | Path | What it is |
| --- | --- | --- |
| The contract | `electron/shared/harness-contract.ts` | `HarnessId` (`'claude-code'` only, for now) and `Capabilities`. Types only. |
| The port | `electron/main/harness/port.ts` | `HarnessAdapter`: `id`, `capabilities`, and the methods stories add. |
| The registry | `electron/main/harness/registry.ts` | `createHarnessRegistry({ isAgentSession })` → `{ adapterFor, harnessOf }`, and `sessionAdapter()` for the shared runtimes. |
| Adapter #1 | `electron/main/harness/claude-code/` | `claudeCodeAdapter`. |

### The port grows by story

| Method | Story |
| --- | --- |
| `launch` | HIVE-234 (landed) |
| `prepare` | HIVE-235 (landed) |
| `readHook`, `contextReply` | HIVE-236 (landed); HIVE-237 and HIVE-238 (landed) change what it says |
| `foldEdits` | HIVE-238 (landed) |
| `record`, `meters` | HIVE-239 (landed) |
| `promptMarker` | HIVE-240 (landed) |

### Capabilities: build one, shape for three

`Capabilities` is an interface; each field landed with the story whose core code reads it.
`resume: 'by-id' | 'none'` (HIVE-239) gates the spawn's `history.resumable` lookup;
`meters: boolean` (HIVE-239) gates the receiver's `/statusline` route (404 when false);
`contextDelivery: 'prompt-marker' | 'none'` (HIVE-240) gates `deliver.ts`'s write; `none` types
nothing and records no receipt.
No field is added for a harness that does not exist yet.

### launch

`launch(spec: LaunchSpec): LaunchPlan` (HIVE-234). Both types live on the port, beside
`ContainerSpawn`, so the core can build one and read the other without importing the
adapter.

- **`LaunchSpec` is what the core knows:** the configured `command` (`claudeCommand`,
  `{env}` placeholder and all), `model`, `effort`, `name`, `task`, `sessionUuid` plus
  `resume`, the three paths (`settingsPath`, `pluginDir`, `mcpConfig`),
  `subscriptionAuth`, and a `ContainerSpawn` for a container project.
- **`LaunchPlan` is what it gets back:** `command` for `bootstrap.arm` to type into the
  login shell, `stripEnv` for the spawn to remove from the pty environment, and
  `submitDelayMs` for the bootstrap's text-then-`\r` split (HIVE-63).

Claude Code's `launch` (`harness/claude-code/launch.ts`) wraps `sessionCommand`, which
moved there verbatim, and owns `SUBMIT_DELAY_MS`. `sessions/index.ts` makes the plan
**before** `startProcess`, so the spawn's `stripEnv` comes from it. Only pure resolution
(paths, the hook env, the container map, the session uuid) is hoisted above the spawn;
every side effect keeps its old place after it.

`shellQuote`, the `{env}` expansion (`container-command.ts`) and the host↔container path
map live in `electron/main/container/`, not `sessions/`: the adapter needs them, fence 2
forbids it `sessions/**`, and the headless agent waker uses them too.

### prepare

`prepare: HarnessFiles` (HIVE-235) is the files a harness needs on disk before it starts,
named by purpose: `sessionSettings`, `agentSettings`, `plugin`, `containerSet` and
`mcpConfig`. Claude Code's table points at the writers that moved into
`harness/claude-code/` with byte-identical output: `settings.ts` (session and agent
settings, the status line script), `plugin.ts` and `done-skill.ts`, `mcp-config.ts`
(the host stdio and container HTTP `--mcp-config` files), and `container-files.ts`
(what each file in a container set says).

- **The adapter owns what; the core owns when.** The shared runtimes (`hooks`, `skills`,
  `mcp`, `container/generated.ts`) reach the writers through `sessionAdapter()` in
  `harness/registry.ts`. They keep their own queues, memoisation and failure policy:
  the settings-rewrite queue, the plugin-prune chain, the MCP memo, the container-removal
  wait. These runtimes are app-wide, not per entity, so `harnessOf` has nothing to answer
  them with. Phase 1's `sessionAdapter()` is Claude Code.
- **One spawn-time sequence.** `prepareSession` in `ipc/index.ts` runs what `ptySpawn` and
  `ptyRestart` used to order by hand: `skills.sync()`, `hooks.rewriteSettings()`,
  `mcp.start()`, then for a spawn the container removal wait and the per-session container
  write. It returns `PreparedFiles` (`settingsPath`, `pluginDir`, `mcpConfig`; absent means
  no flag), which travels on `OpenRequest.files` into `spawn`. `spawn` no longer asks a
  runtime for a path. A restart leaves its container write to `restartOnce`, in the window
  after the old process exits.
- **`container/layout.ts` is a leaf.** It holds the container set's filenames and
  `ContainerOrigins`, re-exported from `generated.ts`. `generated.ts` imports the registry
  and the adapter's `container-files.ts` needs the filenames, so the names live where
  `registry → claude-code → container` cannot cycle back.
- **Not moved (HIVE-336):** the `~/.claude` readers in `skills/paths.ts` and
  `skills/available.ts`, `PLUGIN_DIR`, and `agents/**`, which only ever receive paths. The
  server descriptors (`hiveServerSpec`, `containerHiveServerSpec`) stay in `mcp/` because
  the agent path shares them.

### The registry

`harnessOf(entityId)` answers `'claude-code'` for an agent session and `undefined` for a
plain terminal or a command (story 102). Only the sessions closure knows which an entity
is: ids are minted by the renderer, so a prefix proves nothing. The fence below stops
`harness/**` from importing `sessions/**`, so the core passes the fact in as
`isAgentSession`. HIVE-234 made that the single source for the distinction, replacing
`terminalEntities` in `electron/main/sessions/index.ts`.

`sessions/index.ts` answers `isAgentSession` from a positive `agentSessions` set: `spawn`
adds the entity before its process starts, and `settleExit` removes it. A failed spawn
does not remove it, because a session whose spawn failed was never a terminal. A
terminal is `harnessOf(id) === undefined` and not a command, since `harnessOf` is
`undefined` for both. So the `ptySpawn`/`ptySpawnTerminal` split now means harness
session versus plain terminal.

`adapterFor(id)` indexes a `Record<HarnessId, HarnessAdapter>`, so a `HarnessId` with no
adapter is a compile error, not a runtime miss.

Outside `electron/main/harness/**` and the contract's `HarnessId` type, nothing names
`claude-code`.

## The hook body (HIVE-236)

The receiver (`electron/main/hooks/receiver.ts`) owns the socket: authentication, the body
cap, the routes, and which lane a hook is on. A hook from an entity session is on the
`session` lane; one from an agent's headless run is on the `agent` lane, decided before a
byte of the body is read.

`readHook({ lane, entityId, body, truncated })` turns a Claude body into an ordered list
of `HookEffect`s and calls nothing. The receiver dispatches them to its callbacks in that
order, and decides what a prompt means: a ledger marker, a ticket intent, the first-prompt
name. `contextReply` is the adapter's wrapper for a marker's context reply.

The session lane reads with `harnesses.adapterFor(harnesses.harnessOf(id))`, and falls back
to `sessionAdapter()` when `harnessOf` answers `undefined`. The agent lane always reads with
`sessionAdapter()`, whose `prepare.agentSettings` wrote its hooks. The Claude vocabulary
(the subscribed events, their mapping to `StatusSignal`, the notification types, the reply shape and the
curl command hooks) lives in `harness/claude-code/hook-vocabulary.ts`, behind fence 1.
The core reads `StatusSignal` (`@shared/harness-contract`): the tracker, the inbox, `/done` and the
`session:status` payload never see a Claude event name (HIVE-237).

The plan effect carries a `PlanUpdate { entityId, op, cwd? }` (`@shared/plan-contract`,
HIVE-238). `harness/claude-code/plan-ops.ts` reads Claude's task tools, plan mode and
plan-file writes into a `PlanOp` (`task-created`, `task-updated`, `task-deleted`,
`tasks-replaced`, `plan-proposed`, `plan-file-touched`), and a `Stop` becomes
`plan-file-reread`. The plans store applies ops and never sees a Claude tool name or field.
The changed-files reader keeps its incremental transcript read and hands the lines to
`adapter.foldEdits`, which owns the transcript's format.

### record and meters

`record: HarnessRecord` (HIVE-239) is where a harness keeps a conversation: `transcriptPath(cwd, uuid)`,
`hasTranscript(cwd, uuid)` (the history's `--resume` check, through `sessionAdapter()` because history rows
carry no harness), `titleOrigin(cwd, uuid, name)` (rename or the harness's own guess) and `nameFromTitle(title)`
(the harness's reading of an OSC title; the scanner in `sessions/title.ts` stays generic and takes it as an
argument, since `harness/**` may not import `sessions/**`). `meters(body)` reads a status-line body into the
neutral `SessionMetrics`. Claude Code's live in `claude-code/{record,title-origin,title,metrics}.ts`.

## Context delivery (HIVE-240)

- ***When* is shared:** `electron/main/ledger/deliver.ts` decides it: idle, the empty-prompt
  read, the HIVE-135 draft hold, and receipts written only for a write that landed.
- ***What* is the adapter's:** `promptMarker(entry)`. Claude's is `📒 <ref>\r`, in
  `claude-code/prompt-marker.ts`.
- **The other half is the receiver:** `parseLedgerMarker` and `markerContext` stay shared, and the
  adapter only wraps the reply (`contextReply`).
- `deliver` reaches the adapter through `Sessions.adapterOf`, which falls back to `sessionAdapter()`
  for an entity no harness drives. An adapter that is absent (the session layer is not up) or
  declares `none` gets nothing typed and no receipt, so the next idle or ready transition asks again.

## Input profile (renderer, HIVE-240)

- `src/lib/harness/input-profile.ts` holds `InputProfile { newline, lineKill, lineMotion,
  claimsBareBack }`, `DEFAULT_INPUT_PROFILE` (today's keymap values: `NEWLINE_SEQUENCE`,
  `LINE_KILL_SEQUENCE`, `LINE_MOTION_SEQUENCE`, `claimBareBack`) and `inputProfileFor(harness)`.
- `Session.harness` is stamped where the store mints a session: a spawn, a `/clear` successor and
  history hydration.
- The profile flows `inputProfileOf(id)` (`src/lib/terminal/resolve-transport.ts`) → `center-stage`
  → the `TerminalHost` entry → `TerminalSurface`'s `inputProfile` prop. The store's
  `sendToSession` takes it too, for the line break inside a sent message.
- The surface still imports no store. It holds the prop in a ref, read per keystroke and per prompt
  read, so the key handler installed once never pins a stale profile.

## The port as built

- `launch(spec): LaunchPlan`.
- `prepare: HarnessFiles`, a property reached through `sessionAdapter()`, whose result travels as
  `PreparedFiles` on `OpenRequest.files`.
- `readHook(input): HookReading`, `contextReply(text)`, `promptMarker(entry)`,
  `foldEdits(tallies, lines)` and `meters(body)`.
- `record: { transcriptPath, hasTranscript, titleOrigin, nameFromTitle }`.
- `capabilities: { resume, meters, contextDelivery }`.

## The fences

Both are `import/no-restricted-paths` zones in `eslint.config.mjs`, and
`pnpm verify:boundaries` plants a violation for each.

1. **The driven side stays sealed.** Nothing outside `electron/main/harness/**` may import
   `electron/main/harness/claude-code/**`. Everyone else goes through the registry.
2. **Adapters don't reach the core.** `electron/main/harness/**` may not import
   `electron/main/{sessions,ipc,notifications,plans}/**`. The core passes what an adapter
   needs in as arguments.

## Adding a second harness

The checklist, member by member, with the live suite that proves each:

- [ ] A `HarnessId` member in `electron/shared/harness-contract.ts`.
- [ ] An adapter in `electron/main/harness/<id>/`, registered in `registry.ts` (`adapters` is a
  `Record<HarnessId, …>`, so a missing one fails to compile).
- [ ] `launch` (`test:pty` for the spawn, `test:ready` for boot).
- [ ] `prepare` (`test:hooks`, `test:skills`, `test:mcp-http`, `test:container`).
- [ ] `readHook` (`test:hooks`, `test:plan`, `test:done`).
- [ ] `contextReply` (`test:hook-context`).
- [ ] `promptMarker`, if `contextDelivery: 'prompt-marker'` (`test:marker`, `test:nudge`).
- [ ] `foldEdits` (unit; transcript fixtures).
- [ ] `meters`, if `meters: true` (`test:statusline`).
- [ ] `record` (`test:title`, plus `test:back` for resume, if `resume: 'by-id'`).
- [ ] An `InputProfile` in `PROFILES` in `src/lib/harness/input-profile.ts`, keyed by `HarnessId`,
  so a missing one fails to compile (`test:back` for `claimsBareBack`; `test:pty` for the bytes).
- [ ] Stamp the new `harness` where the store mints that kind of session.
- [ ] Re-run the Epic grep.

The wiring, in order:

1. Add its id to `HarnessId` in `electron/shared/harness-contract.ts`.
2. Add `electron/main/harness/<id>/index.ts` exporting a `HarnessAdapter`.
3. Add it to the registry's `adapters` table (the compiler insists).
4. Add its folder to fence 1's `from` in `eslint.config.mjs`, and a planted case to
   `scripts/verify-boundaries.mjs`.
5. Teach `harnessOf` how the core says which harness an entity runs. Phase 1 answers
   `'claude-code'` for every agent session.
6. Implement `prepare`: a `HarnessFiles` table writing the files the harness reads at
   launch. `sessionAdapter()` decides which adapter the shared runtimes write for.

## Known remainder

`skills/paths.ts`'s `~/.claude` readers move in HIVE-345.
