# Compatibility

This document records the Pi contracts this extension depends on. It is not a
summary of upstream `main`. The original audit covered 0.85.1; the prompt
delivery path was also tested against an existing Pi 1.4.0 installation.

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

Minimum supported version remains **0.85.1**. Version 0.11.1 also has an offline
integration matrix for **1.4.0**. Other versions are not verified.

| Pi | Injection | Cache boundary |
| --- | --- | --- |
| 0.85.1 | Complete `systemPrompt` return, used as the turn's prompt | Tool changes can rebuild the native prefix; no delta-preservation claim |
| 1.4.0 | Complete `systemPrompt` return, projected as the request's system message | Same: a forced prompt carries no sections, so tool changes rebuild the header while a profile is active |

The extension registers the same hooks on every supported version and does not
read `VERSION` to branch behavior. The transport matrix uses real loading, AgentSession and serialization, captures
`onPayload` before sending, and supplies synthetic responses. It verifies
payload structure, not cache hits, billing or quota. No API key is required.
Run only that file with:

```bash
npx vitest run test/integration/prompt-cache.test.ts --maxWorkers=1 --no-file-parallelism
```

Set `PPP_TEST_PI_PACKAGE` to the root of another existing Pi package to repeat
the matrix without replacing the project's dependencies. Tests cover native,
off, active, tool additions, run-local freezing, selection/reload, resume and
foreign complete-prompt handlers.

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
| `before_agent_start` | resolve the profile and return the complete prompt | see below |
| `before_provider_request` | observe the payload, never rewrite it | handlers run in extension load order; returning `undefined` keeps the payload |
| `session_shutdown` | drop cached state | reason `quit \| reload \| new \| resume \| fork` |

There is no `model_change` hook; that name is a session entry type. The model
hook is `model_select`.

## System prompt

### Legacy Pi (verified 0.85.1)

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

### Complete prompt return (all versions)

`before_agent_start` resolves the profile once, composes the prompt and returns
`{ systemPrompt }`. Pi 0.85.1 assigns that string to the agent's prompt for the
turn. Pi 1.4.0 records it as `forceSystemPrompt` and projects it as the request's
single system message after every hook (`_installAgentForcedPromptProjection`),
without writing it to the session transcript. The value is chained: each later
handler receives the previous one as `event.systemPrompt`, and a managed block
already present is stripped before exactly one is prepended.

A forced prompt carries no sections, so while a profile is active Pi's native
section deltas are not used: adding a tool mid-run rebuilds the system header,
and a structured section contributed by an extension that runs after this
handler is not part of that run's request. An extension that replaces the prompt
after this one can still drop the block. The adapter warns once per run when the
block is absent from a recognized payload, or reports an unverified format, and
does not restore the profile by mutating provider payloads.

### Payload observation

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

## Subagents

`ctx` carries no "this is a subagent" flag. The adapter recognizes a child
through the `PI_SUBAGENT_CHILD` environment variable that `pi-subagents` sets on
child processes. That is a soft integration with one launcher, not a Pi
contract: if the variable is absent, the subagent policy does not apply and the
run behaves like a normal session. Foreground children of `pi-subagents` do not
load ambient extensions at all, so this extension is not present in them unless
it was added to the child explicitly. The variable is inherited by every
descendant of the runner process, so a Pi started from that environment is also
treated as a child.

## Known limits

- There is no priority field on events. Appenders preserve the block in either
  load order because the value is chained and recomposed. An extension that
  returns its own complete prompt after this handler replaces the chained value
  and can discard the block; the payload warning reports that rather than
  claiming the profile was applied.
- The extension cannot guarantee that a provider adapter serializes the block in
  a particular field, and cannot stop a provider from ignoring a system message.
- `before_agent_start` runs per prompt, so the profile is frozen for the run.
  A model change during an active run is applied on the next run; the extension
  does not abort streaming to swap instructions.
- A restored session reads the current file on disk, not the version that
  existed when the entry was written. `/sp status` reports the resolved ref; the
  layer hashes change when the file changes.
