# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows the `0.y.z` convention used by its author: `PATCH` for
compatible fixes, `MINOR` for features or breaking changes.

## Unreleased

## 0.6.0 - 2026-09-19

### Added

- `/sp config` shows a config file and its diagnostics, and `/sp set` and
  `/sp unset` change `subagents`, `inheritGlobalBindings` and `selection`
  without editing the file. The interactive menu gained "Show configuration" and
  "Change a setting".

## 0.5.0 - 2026-09-18

### Added

- The `subagents` config key (`off`, `bindings`, `inherit`) controls whether the
  profile applies inside a subagent.

### Changed

- A background subagent no longer receives the `defaultProfile`. With the default
  `bindings` policy, only an explicit binding that matches the child's model
  applies.

## 0.4.1 - 2026-09-18

### Added

- The interactive bind menu can target every model of a provider (`provider/*`)
  or any model of any provider (`*/*`).

### Changed

- Profile and model pickers use a searchable list capped at ten rows. Pi's
  extension selector renders every option, so the model catalog pushed the
  dialog off the screen.
- Interactive `/sp bind` asks for a provider and then a model, and shows the
  active model and the profile's existing bindings.
- Generated binding ids use `any` for a wildcard segment (`base-deepseek-any`,
  `base-any-any`).

## 0.3.1 - 2026-09-18

### Changed

- The managed block no longer names the active profile, its scope or the
  inherited base. Layers are emitted as plain text without headings, so the
  block carries no identifier for the active profile.

## 0.3.0 - 2026-09-18

### Changed

- The managed block now declares the profile the primary system instructions and
  requires them to be followed over any conflicting instruction.
- The block no longer names the extension, and its begin and end markers are
  neutral.

### Removed

- The caveat that the ordering was not a guarantee of obedience.

## 0.2.0 - 2026-09-18

### Added

- The `/sp` picker and `/sp list` now show the folder each profile lives in.

### Removed

- The managed block no longer states that it is not an administrative override of
  provider-side restrictions.

## 0.1.0 - 2026-09-18

### Added

- Markdown system prompt profiles read from the global Pi config directory and,
  when the project is trusted, from the project.
- A single active profile per session with optional `extends` inheritance.
- Deterministic auto-selection through provider/model bindings and defaults.
- The `/sp` command with `list`, `use`, `auto`, `off`, `status`, `why`,
  `preview`, `bind`, `unbind`, `reload`, `validate`, `new`, `edit` and
  `default`, plus a guided menu when it runs without arguments.
- Non-interactive flags `--sp-profile`, `--sp-auto` and `--sp-off`.
- Session-scoped selection persisted as a custom session entry.
- A versioned JSON schema and an examples folder.
- A documentation site built with Astro and Starlight, published on GitHub Pages.
