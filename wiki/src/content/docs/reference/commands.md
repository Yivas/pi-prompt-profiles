---
title: Commands
description: The /sp command, its subcommands and the non-interactive flags.
---

Running `/sp` with no arguments opens a menu:

- Choose a profile for this session
- Create a new profile
- Edit a profile
- Bind a profile to a model
- Set the default profile
- Show status
- Preview the active profile
- Reload from disk
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
| `/sp unbind <binding-id> [--scope global\|project]` | Remove a binding. |
| `/sp reload` | Re-read config and profiles from disk. |
| `/sp validate` | Report configuration problems. |
| `/sp new <id> [--scope global\|project]` | Create a profile file. |
| `/sp edit <profile>` | Edit a profile in Pi's editor. |
| `/sp default <profile> [--scope global\|project]` | Set `defaultProfile`. |

A profile can be written as a bare id, `global:id` or `project:id`. A bare id is
looked up in the trusted project first, then globally.

## Interactive pickers

Profile and model pickers open a searchable list capped at ten visible rows: type
to filter, arrow keys to move, Enter to select and Escape to cancel. The model
step asks for a provider first, then for one of its models, and shows the active
model and the profile's existing bindings. `(any provider)` and `(any model of
...)` create `*/*` and `provider/*` bindings. Outside the TUI the same choices
appear in Pi's selector, paged ten at a time.

`/sp use` and `/sp auto` change only the current session. They do not modify
`config.json`. Persistent operations take an explicit `--scope` or a scope you
choose in the menu.

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
