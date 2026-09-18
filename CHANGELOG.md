# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows the `0.y.z` convention used by its author: `PATCH` for
compatible fixes, `MINOR` for features or breaking changes.

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
