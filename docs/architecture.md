# Architecture

`pi-prompt-profiles` applies a Markdown system prompt profile to the prompt Pi
already composed. It keeps two clearly separated layers:

```text
src/core/    pure logic: config, profiles, inheritance, matching, resolution,
             composition. No Pi import at runtime.
src/adapter/ the Pi extension: hooks, commands, flags, session state and the
             disk layer. Calls into the core.
```

The split exists so the decision logic can be unit tested without Pi and so a
future integration can reuse `resolveProfile`.

## Data flow

```text
session_start ──▶ Runtime.ensure ──▶ loadState (global + trusted project)
                        │
model_select ───────────┼──▶ invalidate cache
session_tree ───────────┼──▶ restore selection from the active branch
                        │
before_agent_start ─────┴──▶ resolveProfile ──▶ freeze managed block
                                              │
context_with_system ───────────────────────────┴──▶ prepend to request header (Pi 1.4+)

before_provider_request ──▶ observe(payload), warn if missing (read-only)

Legacy Pi: before_agent_start ──▶ applyManagedPrompt ──▶ { systemPrompt }
```

## On-disk layout

```text
<agentDir>/system-prompts/
├── config.json
└── profiles/
    ├── base.md
    └── review.md

<projectDir>/.pi/system-prompts/
├── config.json
└── profiles/
    └── local.md
```

`agentDir` is whatever Pi resolves through `getAgentDir()`. The directory name
for project state comes from the exported `CONFIG_DIR_NAME`, not a hardcoded
`.pi`. The extension's own code and the user's profiles are separate: updating
the package never touches `system-prompts/`.

Project files are read only when `ctx.isProjectTrusted()` is true. An untrusted
project contributes neither profiles nor bindings, and the extension never reads
its config.

## Profile discovery

A profile is `<id>.md` inside `profiles/`. The file name is the id. Ids are
validated (`[A-Za-z0-9][A-Za-z0-9._-]*`, no `..`, no separators), files that
resolve outside the root through a symlink are refused, oversized files are
skipped with a diagnostic, and the body is kept verbatim except a leading UTF-8
BOM. Metadata is optional and lives in `config.json`, not in frontmatter.

## Inheritance

`extends` points to one optional parent. A bare id resolves inside the same
scope, so a global profile never depends on a local file. The chain is expanded
with a documented depth limit (8) and total size limit (256 KiB). Cycles,
missing parents and limit violations invalidate the whole profile instead of
silently dropping a layer. The specific profile is emitted first, then its
bases.

## Selection

Selection is one value with three modes (`auto`, `manual`, `off`) and one
precedence order:

```text
session (flag or /sp use) > trusted project config > global config > auto
```

A session-level value is persisted as a custom session entry
(`pi-prompt-profiles/selection`) and restored from the active branch on resume
and tree navigation, never from the latest entry of another branch.

In auto mode the order is:

```text
1. project bindings
2. global bindings          (unless project inheritGlobalBindings: false)
3. project defaultProfile
4. global defaultProfile
5. none                     (Pi keeps its native prompt)
```

Explicit rules always come before defaults, even when the rule is global and the
default is local. Inside one scope, higher `priority` wins; then the most
specific matching rule; then, if different profiles still tie, the extension
reports a conflict and does not choose by filesystem order.

A rule combines `provider` and `model` with AND; the array is OR. Matching is
full string. The only wildcard is `*`, which matches any run of characters
including `/`, so `deepseek/*` matches `deepseek/chat` and `deepseek/a/b`.
Specificity, from highest to lowest: both exact, model exact, provider exact,
both patterns.

Changing the active profile never changes the model, provider, thinking level or
permissions.

## Composition

`src/adapter/prompt.ts` freezes the resolved block in `before_agent_start`.
On Pi 1.4+, `context_with_system` prepends that block to the leading system
message for each request. It keeps the header's sections and tool declarations,
all later system updates, and the conversation intact. The projection is
request-local: it never writes the block into session history or forces the
complete prompt. The profile stays fixed during the run while Pi can update
its native tool instructions.

On legacy Pi, including the verified 0.85.1, the extension still prepends to the
chained `event.systemPrompt` and returns the complete string. That API has no
system-section deltas; adding tools can invalidate the native prefix as well.
The version branch uses Pi's public `VERSION` export; registering an unknown
hook would not prove that legacy Pi emits it.

The block emits the specific profile and its bases, separated only by blank
lines: the extension writes no heading, id or scope into the prompt, so the
block carries no identifier for the active profile and no statement about
priority. This is prompt text, and it does not create a privileged message type
at the API level.

Composition is idempotent and stable: the same selection and content produce
byte-identical text, with no timestamps, random ids or diagnostics inside the
prompt. Hashes are computed for diagnostics only and never injected.

`off` or no matching profile clears the frozen block on the next run. The
modern projection also removes an older leading managed block if present,
without changing the stored transcript. Legacy Pi restores its base prompt
when no `systemPrompt` is returned. No copy of the profile is written to the
conversation.

## Observation versus truth

Three different things are kept apart in the code and reported separately:

- the pending selection (`Runtime.selection`);
- the prompt composed in `before_agent_start`;
- the payload observed in `before_provider_request`.

`before_provider_request` checks for the frozen block, not just any marker.
It never rewrites the payload. If a recognized payload lacks the block, it
warns once per run and the footer reports `not in payload`; an unrecognized
format reports `payload unverified` instead. A selected profile is not proof
that it reached the model. `/sp preview` remains an estimate plus the last
observation, not a final capture.

In modern Pi, another extension returning `systemPrompt` (even unchanged or
only appended) causes a later forced-prompt projection to discard this
extension's request-local prepend, in either load order. The warning exposes
that incompatibility; the extension does not rewrite the foreign override.
Extensions contributing structured sections can coexist without that force.

## Caching and lifecycle

State is read once per `(cwd)` and cached; `/sp reload` clears it. The extension
registers no background watchers, timers or processes, and no listeners that
need manual disposal. Cache keys include `cwd`, so a reused instance cannot leak
one project's local profile into another.

A local benchmark (`npm run bench`) resolves against 50 bindings. On the
development machine it measured a mean of about 0.009 ms per resolution; this is
one machine's measured value, not a guarantee. Resolution is a pure function of
the model and the loaded state.

## Interactive pickers

`src/core/picker.ts` holds the pure list logic: provider names, the models of one
provider, filtering and the visible window. `src/adapter/picker.ts` turns it into
`SearchList`, a component shown with `ctx.ui.custom` that filters as the user
types and renders at most ten rows, sized down to the terminal height. Pi's own
extension selector renders every option and has no filter, so handing it a full
model catalog, or the action labels, pushed the dialog off the screen.
Outside the TUI, `selectItem` falls back to `ctx.ui.select` with ten-item pages.
The action menu, the profile pickers and `/sp bind` all go through it; the bind
flow asks for a provider and then a model, with `*` options for `provider/*` and
`*/*`.

## Configuration commands

`src/core/settings.ts` holds one registry of the editable scalar keys
(`subagents`, `inheritGlobalBindings`, `selection`, and `defaultProfile` for
removal only): the accepted values, the scopes where `set` is allowed and the
parser. `/sp set` validates before writing, `editConfig` refuses a config whose
version is not 1 and preserves unknown fields, and the written document is
reloaded and revalidated. `effectiveSetting` reports the project, global or
default value and where it came from; `/sp config` and the menu use it. After a
write, the extension applies the config baseline only when the session has no
selection of its own, so a session pin is never silently overridden.

## Subagents

A child session resolves on its own. The `subagents` config key caps what it may
apply: `bindings` (default) uses only an explicit binding that matches the
child's model, `inherit` resolves normally and `off` applies nothing. The
adapter recognizes a child through the `PI_SUBAGENT_CHILD` environment variable
that `pi-subagents` sets; the core stays unaware of it.

## Paths, writes and errors

Paths are validated against the authorized roots and rewritten through the
filesystem, so a symlink cannot escape. Writes are atomic (temp file + rename).
Config edits rewrite the whole JSON object, which preserves unknown fields, and
are refused when the file changed since it was read. A failed selection change
keeps the previous valid state. A failing hook is caught and reported; Pi keeps
its native prompt.
