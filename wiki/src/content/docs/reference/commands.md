---
title: Commands
description: The /sp command, its subcommands and the non-interactive flags.
---

Running `/sp` with no arguments opens a menu:

- Choose a profile for this session
- Create a new profile
- Edit a profile
- Manage model bindings
  - Add a binding to a model
  - List bindings
  - Remove a binding
  - Back to the main menu
- Set the default profile
- Show status
- Preview the active profile
- Reload from disk
- Show configuration
- Change a setting
- Change the control statement
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
| `/sp control-text [full\|none]` | Set the control statement of the active profile. Without a value it opens a picker. |
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

The bindings submenu stays open after adding, listing or removing, so several
bindings can be handled in one pass; Escape returns to the chat. "List bindings"
shows every entry of both configs as `scope:id — profile ← rules (priority n)`,
which is how you find the id of the binding to remove.

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

## Control statement

`profiles.<id>.controlText` decides whether the managed block keeps the control
statement it opens with. Three ways set it:

1. `/sp control-text` opens a `full`/`none` picker that marks the current value.
   "Change the control statement" in the guided menu opens the same picker.
2. `/sp control-text full|none` writes the value directly, with no picker. This
   form works without an interactive terminal.
3. Edit `profiles.<id>.controlText` in `config.json` and run `/sp reload`.

The command targets the profile that is active now; when none is active it says
so and changes nothing. It writes to that profile's own config, so a global
profile is never written into the project config, and the other way round. The
value is stored per profile, not as a global or session setting: each profile
keeps its own `controlText`, so switching profiles — with `/sp use`, a binding or
`defaultProfile` — brings back the value stored for the profile that becomes
active, and the menu entry changes only the profile active at that moment. The
change takes effect on the next turn, without `/sp reload`. `full` (the default)
keeps the control statement; `none` writes the profile bodies only, with the
markers and their order untouched. See [Configuration](../configuration/) for
the field itself.

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
[auto]` or `SP: off`. The status adds `· next run` when the current selection or
model has not been composed into the prompt on screen yet.
