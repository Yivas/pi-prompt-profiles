<p align="center"><img src="https://yivas.github.io/pi-prompt-profiles/logo.svg" alt="pi-prompt-profiles: a pi glyph on a dark rounded square" width="72" height="72"></p>

# pi-prompt-profiles

Model-aware system prompt profiles for [Pi](https://github.com/earendil-works/pi),
written in Markdown and switched without restarting Pi.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`pi-prompt-profiles` keeps your system prompts as plain Markdown files, lets you
switch the active one per session, and binds a profile to a model so it is chosen
automatically. The active profile is prepended to the prompt Pi would send
anyway, so tools, `AGENTS.md`, skills and every other instruction Pi loaded stay
in place.

## Why

Pi already composes a system prompt from its own instructions, project context
and skills. This extension adds one layer above that composition, without
rewriting it: a profile you can version, keep per project, and attach to a model
family. It does not choose the model, change the provider, or route execution.

## Status

- Version `0.1.0`, first public version.
- Not published to npm yet. The local install path is the supported way to try
  it today.
- Verified against `@earendil-works/pi-coding-agent` **0.85.1** only. See
  [docs/compatibility.md](docs/compatibility.md) for the exact contracts and
  limits.

## Requirements

- Pi `0.85.1` or another version you have verified yourself.
- Node.js 22.19 or newer for development and tests.

## Install

Not published yet, so install from a local checkout:

```bash
git clone https://github.com/Yivas/pi-prompt-profiles
cd pi-prompt-profiles
npm install
```

Then load it without changing your global configuration:

```bash
cd /path/to/your/project
pi -e /path/to/pi-prompt-profiles
```

To install it for real, from the Pi CLI:

```bash
pi install /path/to/pi-prompt-profiles
```

That writes to your Pi settings; it does not copy or touch your profiles.

## Your first profile

Create a profile body and, optionally, a default in `config.json`:

```text
<agentDir>/system-prompts/
├── config.json
└── profiles/
    └── base.md
```

`<agentDir>` is what Pi resolves through `getAgentDir()`. `config.json`:

```json
{
	"version": 1,
	"selection": { "mode": "auto" },
	"defaultProfile": "global:base"
}
```

`profiles/base.md` is just Markdown. Everything in it becomes part of the
system prompt when the profile is active:

```markdown
Work in small, verifiable steps. State your assumptions when a request is
ambiguous, and ask before changing scope.
```

Reload with `/sp reload`. A project can add its own profiles under
`<projectDir>/.pi/system-prompts/`; those are read only when the project is
trusted.

A complete fictional example lives in [examples/](examples/).

## Commands

| Command | Effect |
| ------- | ------ |
| `/sp` | Interactive selector (TUI and RPC modes). |
| `/sp list [--scope global\|project]` | List profiles. |
| `/sp use <profile>` | Pin a profile for this session, regardless of the model. |
| `/sp auto` | Remove the pin and resolve from bindings and defaults. |
| `/sp off` | Disable the manager for this session. |
| `/sp status` | Show mode, origin, model, profile and the last observation. |
| `/sp why` | Explain the resolution, including discarded rules. |
| `/sp preview` | Show the managed block and its size. May contain private text. |
| `/sp bind <profile> [--provider <p>] [--model <m>] [--scope ...] [--priority <n>]` | Add a model binding. Run without flags for a model picker. |
| `/sp unbind <binding-id> [--scope global\|project]` | Remove a binding. |
| `/sp reload` | Re-read config and profiles from disk. |
| `/sp validate` | Report configuration problems. |
| `/sp new <id> [--scope global\|project]` | Create a profile file. |
| `/sp edit <profile>` | Edit a profile in Pi's editor. |
| `/sp default <profile> [--scope global\|project]` | Set `defaultProfile`. |

`/sp use` and `/sp auto` change only this session. They do not modify
`config.json`. Persistent operations require an explicit `--scope` or a
user-selected scope.

## Flags

Non-interactive runs can start with a selection:

```bash
pi --sp-profile review
pi --sp-profile project:local
pi --sp-auto
pi --sp-off
```

Combining two of them is rejected and reported; the extension then follows your
normal configuration.

## Precedence

Selection, from highest to lowest:

```text
session (flag or /sp use) > trusted project config > global config > auto
```

In `auto` mode:

```text
1. project bindings
2. global bindings        (unless the project sets inheritGlobalBindings: false)
3. project defaultProfile
4. global defaultProfile
5. none                   (Pi keeps its native prompt)
```

Explicit rules come before defaults. Within a scope, higher `priority` wins,
then the most specific rule. A rule combines `provider` and `model` with AND and
the array with OR. Matching is full string; `*` matches any characters including
`/`, so `deepseek/*` matches `deepseek/chat`. There are no regular expressions.

The specific profile is emitted before its bases. The block tells the model that
the specific profile wins over its bases on conflict; inherited profiles only
fill in what it does not contradict. That is an instruction, not a guarantee.

## Trust and privacy

Project profiles and bindings are ignored unless `ctx.isProjectTrusted()` is
true. The extension reads files only from the Pi agent directory and, when
trusted, the project's `.pi/system-prompts`. It opens no network connections,
runs no commands from profile text, and sends no telemetry. `/sp preview` and
`/sp edit` show profile text on purpose; treat them as private.

## Coexistence

- `SYSTEM.md` / `APPEND_SYSTEM.md` and Pi's built-in prompt are preserved. The
  extension never sets `customPrompt`, so native tool and documentation
  instructions are not dropped.
- `AGENTS.md` context and skills are preserved and stay below the managed block.
- Another extension that prepends or appends keeps the managed block. An
  extension that returns a full replacement `systemPrompt` after this one will
  discard it; the integration test documents that case.

## Errors and degraded mode

If the configuration is invalid, the version is unknown, a profile is missing or
an inheritance chain is broken, the extension reports the problem and lets Pi
use its native prompt. It never claims a profile is active when it is not. A
failed selection change keeps the previous valid state.

## Uninstall

```bash
pi remove /path/to/pi-prompt-profiles
```

or remove the entry from Pi's settings. Uninstalling does not delete
`system-prompts/` in your agent directory or your project. Delete those folders
yourself if you want to remove the data.

## Documentation

- [Wiki](https://yivas.github.io/pi-prompt-profiles/) — guides, command reference and troubleshooting.
- [docs/architecture.md](docs/architecture.md) — design, data flow, resolution.
- [docs/compatibility.md](docs/compatibility.md) — verified Pi contracts and limits.
- [examples/](examples/) — a fictional global setup.
- [schema/config.schema.json](schema/config.schema.json) — config JSON Schema.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run bench   # local resolution benchmark
```

The test suite uses the installed Pi packages and a simulated provider payload.
It needs no API key and sends nothing over the network.

## Contributing, support and license

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports follow [SECURITY.md](SECURITY.md).

Released under the [MIT License](LICENSE).
