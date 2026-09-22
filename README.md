# pi-prompt-profiles

Model-aware system prompt profiles for [Pi](https://github.com/earendil-works/pi),
written in Markdown and switched without restarting Pi.

[![npm version](https://img.shields.io/npm/v/pi-prompt-profiles.svg)](https://www.npmjs.com/package/pi-prompt-profiles)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Version `0.6.0`, verified against Pi `0.85.1`.

[Website](https://yivas.github.io/pi-prompt-profiles/) · [Install](#install) · [Command reference](https://yivas.github.io/pi-prompt-profiles/reference/commands/) · [Releases](https://github.com/Yivas/pi-prompt-profiles/releases) · [Contributing](https://github.com/Yivas/pi-prompt-profiles/blob/main/CONTRIBUTING.md)

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

- Version `0.6.0`. First public release `0.1.0`.
- Published on npm as [`pi-prompt-profiles`](https://www.npmjs.com/package/pi-prompt-profiles).
- Verified against `@earendil-works/pi-coding-agent` **0.85.1** only. See
  [docs/compatibility.md](docs/compatibility.md) for the exact contracts and
  limits.

## Requirements

- Pi `0.85.1` or another version you have verified yourself.
- Node.js 22.19 or newer for development and tests.

## Install

```bash
pi install npm:pi-prompt-profiles
```

Load it for a single run without changing your settings:

```bash
pi -e npm:pi-prompt-profiles
```

From a local checkout instead:

```bash
git clone https://github.com/Yivas/pi-prompt-profiles
cd pi-prompt-profiles
npm install
pi install /path/to/pi-prompt-profiles
```

Installing writes to your Pi settings; it does not copy or touch your profiles.

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

Run `/sp` with no arguments for a guided menu. The everyday commands:

| Command | Effect |
| ------- | ------ |
| `/sp` | Guided menu: choose, create, edit, manage bindings (add, list, remove), set default, status, preview, reload, show configuration, change a setting, off. |
| `/sp use <profile>` | Pin a profile for this session. |
| `/sp bind <profile>` | Add a model binding; the picker asks for a provider and then one of its models. `(any provider)` lists every model, and `(any model of ...)` binds a whole provider. |
| `/sp unbind <binding-id>` | Remove a binding; searches both configs unless `--scope` is given. |
| `/sp config` | Show a config file and its diagnostics. |
| `/sp set <key> <value>` | Change `subagents`, `inheritGlobalBindings` or `selection` in the config. |
| `/sp unset <key>` | Remove a setting, including `defaultProfile`. |
| `/sp auto` | Use automatic resolution for this session, ignoring a stored `selection`. |
| `/sp status` | Show mode, origin, model and profile. |
| `/sp off` | Disable the manager for this session. |

The full command and flag reference lives in the
[wiki](https://yivas.github.io/pi-prompt-profiles/reference/commands/). `/sp use`
and `/sp auto` change only this session; they do not modify `config.json`.

Profile and model pickers filter as you type and keep the list within the
screen, so a large model catalog never pushes the dialog off the screen.

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

Selection: session (flag or `/sp use`) > trusted project config > global config
> auto.

In `auto` mode: project bindings, then global bindings (unless the project sets
`inheritGlobalBindings: false`), then the project `defaultProfile`, then the
global one, then nothing (Pi keeps its native prompt). Explicit rules come before
defaults. Higher `priority` wins, then the most specific rule; `*` matches any
characters including `/`.

Inside a subagent, `subagents` decides what may apply: `bindings` (the default)
only an explicit binding for the child's model, `inherit` the normal resolution
and `off` nothing. Only processes that mark themselves as subagents are affected.

The full resolution and composition rules are documented in the
[wiki](https://yivas.github.io/pi-prompt-profiles/reference/resolution/).

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
