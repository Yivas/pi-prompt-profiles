---
title: Commands
description: The /sp command, its subcommands and the non-interactive flags.
---

Running `/sp` with no arguments opens a menu:

- Choose a profile for this session
- Create a new profile
- Edit a profile
- Bind a profile to a model
- Remove a model binding
- Set the default profile
- Show status
- Preview the active profile
- Reload from disk
- Show configuration
- Change a setting
- Turn the manager off for this session

## Subcommands

| Command | Effect |
| ------- | ------ |
| `/sp list [--scope global\|project]` | List profiles. |
| `/sp use <profile>` | Pin a profile for this session, regardless of the model. |
| `/sp auto` | Remove the pin and resolve from bindings and defaults. |
| `/sp off` | Disable the manager for this session. |
| `/sp status` | Show mode, origin, model, profile and the last observation. |
| `/sp why` | Explain the resolution, including discarded rules. |
| `/sp preview` | Show the managed block and its size. May contain private text. |
| `/sp bind <profile> [--provider <p>] [--model <m>] [--scope ...] [--priority <n>] [--id <id>]` | Add a model binding. Run it without flags to pick a provider and then a model. |
| `/sp unbind <binding-id> [--scope global\|project]` | Remove a binding. Without `--scope` it searches the project config first, then the global one. |
| `/sp reload` | Re-read config and profiles from disk. |
| `/sp validate` | Report configuration problems. |
| `/sp new <id> [--scope global\|project]` | Create a profile file. |
| `/sp edit <profile>` | Edit a profile in Pi's editor. |
| `/sp default <profile> [--scope global\|project]` | Set `defaultProfile`. |
| `/sp config [--scope global\|project]` | Show a config file and its diagnostics. |
| `/sp set <key> <value> [--scope global\|project]` | Validate and change a setting. |
| `/sp unset <key> [--scope global\|project]` | Remove a setting. |

A profile can be written as a bare id, `global:id` or `project:id`. A bare id is
looked up in the trusted project first, then globally.

## Interactive pickers

Every `/sp` picker — the action menu, profiles and models — opens a searchable
list capped at ten rows and sized to the terminal: type to filter, arrow keys to
move, Enter to select and Escape to cancel. The model step asks for a provider
first, then for one of its models, and shows the active model and the profile's
existing bindings. `(any provider)` opens one list with every model, labelled
`provider · id`, whose `(any model)` entry creates `*/*`; a concrete choice
stores its own provider and id. `(any model of ...)` creates `provider/*`.
Outside the TUI the same choices appear in Pi's selector, paged ten at a time.

`/sp use` and `/sp auto` change only the current session. They do not modify
`config.json`. Persistent operations take an explicit `--scope` or a scope you
choose in the menu; `/sp unbind` without `--scope` is the exception and searches
both configs, project first.

## Settings

`/sp set` and `/sp unset` change `config.json` without editing the file. Keys:

| Key | Values | Scope |
| --- | ------ | ----- |
| `subagents` | `off`, `bindings`, `inherit` | global and project |
| `inheritGlobalBindings` | `true`, `false` | `set`: project; `unset`: both |
| `selection` (also `selection.mode`) | `auto`, `off` | global and project |
| `defaultProfile` | — | `unset` only; `set` it with `/sp default` |

`selection` is stored as an object, so `/sp set selection off` writes
`{"selection":{"mode":"off"}}` and replaces any stored `profile`. `/sp unset`
removes the key. The command applies the change, unless the session has its own
selection (`/sp use`, `/sp auto` or `/sp off`), in which case it says so and the
stored value applies to new sessions.

## Flags

```bash
pi --sp-profile review
pi --sp-profile project:local
pi --sp-auto
pi --sp-off
```

Combining two of them is rejected and reported; the extension then follows your
normal configuration.

## Status line

Pi's footer shows a short status such as `SP: review [manual]`, `SP: deepseek
[auto]` or `SP: off`. When a change will apply on the next run, the status adds
`· next run`.
