# Compatibility

This document records the Pi contracts this extension depends on. It is not a
summary of the upstream `main` branch: it reflects the installed version that
was read and tested on 2026-09-18.

## Verified environment

| Item | Value |
| ---- | ----- |
| Package | `@earendil-works/pi-coding-agent` |
| Version | `0.85.1` |
| Module format | ESM (`"type": "module"`) |
| Config dir name | `.pi` (`package.json` → `piConfig.configDir`, exported as `CONFIG_DIR_NAME`) |
| Entry point used | `dist/index.js`, types at `dist/index.d.ts` |

Source files read in full and used as the ground truth:

- `docs/extensions.md`, `docs/packages.md`, `docs/prompt-templates.md`
- `dist/index.d.ts`
- `dist/config.d.ts`, `dist/config.js`
- `dist/core/system-prompt.d.ts`, `dist/core/system-prompt.js`
- `dist/core/extensions/types.d.ts`
- `dist/core/extensions/runner.d.ts`, `dist/core/extensions/runner.js`
- `dist/core/extensions/loader.d.ts`, `dist/core/extensions/loader.js`
- `dist/core/session-manager.d.ts`
- `dist/core/model-registry.d.ts`, `dist/core/model-resolver.d.ts`
- `dist/core/agent-session.js`, `dist/core/sdk.js`
- `node_modules/@earendil-works/pi-ai/dist/types.d.ts`

Minimum supported version: **0.85.1**, the only version in the test matrix. No
other version is claimed to work.

## Extension loading

- An extension exports **`default` a factory function** that receives one
  argument, `ExtensionAPI`; it may be sync or async. The loader does
  `jiti.import(path, { default: true })` and rejects a module that does not
  export a function (`dist/core/extensions/loader.js`, `loadExtensionModule`).
- TypeScript is supported without a build step (jiti). This package declares its
  entry as `"pi": { "extensions": ["./src/index.ts"] }`.
- Discovery order (`loader.js`, `discoverAndLoadExtensions`): project
  `<cwd>/.pi/extensions/` first, then `<agentDir>/extensions/`, then configured
  paths in order. Within a directory the order is the filesystem `readdir`
  order, which is not guaranteed to be sorted. The extension therefore does not
  rely on its own name for ordering.
- A factory must not start background resources; work is deferred to
  `session_start` and cleaned up in `session_shutdown`.

## Hooks used

Registered through `pi.on("<name>", handler)`.

| Hook | Used for | Contract verified |
| ---- | -------- | ----------------- |
| `session_start` | load disk state, restore or apply selection, report errors | event has `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"` |
| `session_tree` | restore selection from the active branch | fires after `/tree`; branch-based restore is correct |
| `model_select` | invalidate the cached resolution | event has `model`, `previousModel`, `source: "set" \| "cycle" \| "restore"` |
| `before_agent_start` | prepend the managed block | see below |
| `before_provider_request` | observe the payload, never rewrite it | handlers run in extension load order; returning `undefined` keeps the payload |
| `session_shutdown` | drop cached state | reason `quit \| reload \| new \| resume \| fork` |

There is no `model_change` hook; that name is a session entry type. The model
hook is `model_select`.

## System prompt

`buildSystemPrompt(options)` (`dist/core/system-prompt.js`) is the composition
point:

- `customPrompt` **replaces** the default prompt. If it is set, the tools list,
  the guidelines and the built-in Pi documentation pointers are not generated.
  This extension never sets `customPrompt`. It prepends to whatever Pi produced,
  so native instructions, tools, `AGENTS.md` context and skills are preserved.
- `appendSystemPrompt` is appended.
- `contextFiles` and `skills` are appended after that.
- `System prompt options` are exposed to extensions as
  `event.systemPromptOptions` (`BuildSystemPromptOptions`).

`before_agent_start` (`BeforeAgentStartEvent` → `BeforeAgentStartEventResult`):

- receives `prompt`, `images`, `systemPrompt` (the current chained value) and
  `systemPromptOptions`;
- may return `{ message? }` and/or `{ systemPrompt? }`;
- returning `systemPrompt` **replaces** the prompt for that turn and is
  **chained across extensions**: the runner assigns `currentSystemPrompt =
  result.systemPrompt` and the next handler receives it
  (`dist/core/extensions/runner.js`, `emitBeforeAgentStart`). A later handler can
  replace the string again.
- `ctx.getSystemPrompt()` inside the hook reflects the chain so far.

**`forceSystemPrompt` does not exist** in this version. It was checked in
`BeforeAgentStartEventResult`, `BuildSystemPromptOptions` and the extension
docs. The extension does not depend on it.

`before_provider_request` (`BeforeProviderRequestEvent`) receives an untyped
`{ payload }`. The payload is built by the provider adapter and its schema is
**not documented**; the docs describe the hook as useful for debugging provider
serialization and cache behavior. This extension reads it best-effort (looking
for `system`, or `role: "system" | "developer"` messages) and never modifies it.
Provider-level serialization of the system prompt depends on the adapter, for
example `compat.supportsDeveloperRole` in `docs/custom-provider.md`; that is a
provider concern, not a Pi extension contract.

## Errors

Every handler invocation is wrapped in `try/catch` by the runner; an error is
reported to error listeners and the agent continues (`runner.js`, all `emit*`
methods). A throw is therefore **not** a way to block a request, and this
extension does not use it as one. `before_agent_start` also catches its own
errors, reports them with `ctx.ui.notify` and returns `undefined` so Pi keeps
its native prompt.

## Session state

- Persist: `pi.appendEntry(customType, data)` writes a `CustomEntry`
  (`{ type: "custom", customType, data }`). Custom entries do not enter the LLM
  context.
- Read: `ctx.sessionManager` exposes `getBranch()`, `getEntries()`,
  `buildContextEntries()`, `getLeafId()`, `getLeafEntry()`, `getEntry()`. This
  extension reads the newest custom entry on the **active branch** so forks and
  tree navigation restore the right value.

## Trust

`ctx.isProjectTrusted()` returns the effective decision, including temporary
decisions and CLI overrides (stated in `docs/extensions.md`). Project-local
`.pi/extensions` load only after the project is trusted. This extension reads
project config and profiles only when `isProjectTrusted()` is true.

## Models

`ctx.model` is the active `Model`; `model.provider` and `model.id` are separate
fields and `model.id` may contain `/`. `ctx.modelRegistry` exposes
`getAvailable()`, `find(provider, modelId)`, `getProvider(id)` and
`getProviderDisplayName(id)`; `ctx.scopedModels` is the session-scoped read-only
snapshot. No model version is hardcoded anywhere in this package.

## UI

`ctx.ui` provides `select`, `confirm`, `input`, `editor`, `custom`, `notify`,
`setStatus` and more. `ctx.hasUI` is false in non-interactive modes, and
`ctx.mode` is `"tui" | "rpc" | "json" | "print"`. Commands receive
`ExtensionCommandContext`, which adds `getSystemPromptOptions()`,
`waitForIdle()`, `reload()`, `newSession()`, `fork()`, `switchSession()` and
`navigateTree()`. This extension registers one command (`sp`) and checks the
existing command list before describing collisions.

Pi's generic extension selector (`ExtensionSelectorComponent`,
`dist/modes/interactive/components/extension-selector.js`) renders every option
it is given and has no filter or scroll: a list longer than the terminal pushes
the dialog off the screen. It is only safe for short fixed lists. This extension
uses it for the two-option scope question and, outside the TUI, for ten-item
pages. In `ctx.mode === "tui"` it shows a custom component through
`ctx.ui.custom` (verified signature: `(tui, theme, keybindings, done) =>
Component`), reading `tui.terminal.rows` to size the list and the theme's `fg`
and `bold` to style it. `SearchList` renders one string per element and keeps
every line within the width it is given, because Pi throws when a rendered line
exceeds the terminal width.

## Known limits

- There is no priority field on events. Handler order is load order. If a later
  extension returns a full replacement `systemPrompt`, the managed block is
  gone; the integration test documents this case. Any extension that prepends or
  appends keeps the block.
- The extension cannot guarantee that a provider adapter serializes the block in
  a particular field, and cannot stop a provider from ignoring a system message.
- `before_agent_start` runs per prompt, so the profile is frozen for the run.
  A model change during an active run is applied on the next run; the extension
  does not abort streaming to swap instructions.
- A restored session reads the current file on disk, not the version that
  existed when the entry was written. `/sp status` reports the resolved ref; the
  layer hashes change when the file changes.
