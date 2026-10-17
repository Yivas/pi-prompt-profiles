---
title: Configuration
description: The versioned config.json schema, profiles metadata and bindings.
---

`config.json` exists per scope. A project file is read only when the project is
trusted.

```text
<agentDir>/system-prompts/config.json
<projectDir>/.pi/system-prompts/config.json
```

## Full example

```json
{
	"version": 1,
	"selection": { "mode": "auto" },
	"defaultProfile": "global:base",
	"subagents": "bindings",
	"profiles": {
		"base": { "description": "General working agreements." },
		"review": {
			"extends": "global:base",
			"description": "Careful review of changes."
		}
	},
	"bindings": [
		{
			"id": "review-family",
			"profile": "global:review",
			"priority": 0,
			"match": [
				{ "provider": "openrouter", "model": "deepseek/*" },
				{ "provider": "deepseek", "model": "*" }
			]
		}
	],
	"inheritGlobalBindings": true
}
```

## Fields

### `version`

Must be `1`. An unknown version is rejected and Pi keeps its native prompt.

### `selection`

The baseline selection for a session. It is overridden by a flag or by `/sp use`.

- `{ "mode": "auto" }`
- `{ "mode": "manual", "profile": "global:review" }`
- `{ "mode": "off" }`

### `defaultProfile`

Used in auto mode when no binding matches. A bare id resolves inside the config's
own scope.

### `profiles`

Optional metadata keyed by profile id. `extends` points to one parent.
`description` is shown in the picker.

### `bindings`

Each binding has an `id`, a `profile`, an optional `priority` (higher wins,
default 0) and one or more `match` rules. Inside a rule, `provider` and `model`
are combined with AND; the array is OR. Matching is full string. The only
wildcard is `*`, which matches any characters including `/`.

Omitted `provider` or `model` means `*`.

### `inheritGlobalBindings`

Project-only. `false` makes the project ignore global bindings.

### `subagents`

How the profile applies inside a subagent run:

- `bindings` (default): only an explicit binding that matches the child's model
  applies. The `defaultProfile`, a session pin and a `selection` of `manual` are
  ignored there; `selection: { "mode": "off" }` still disables the extension.
- `inherit`: the normal resolution runs, including the `defaultProfile`.
- `off`: the profile is not applied inside subagents.

A project config overrides the global one; an invalid value is ignored and the
next scope applies, then the default. This only recognizes subagents that mark
their process; other launchers are unaffected.

`subagents`, `inheritGlobalBindings` and `selection` can be changed without
editing the file, with `/sp set <key> <value>` and `/sp unset <key>`; see the
[command reference](../commands/#settings). `defaultProfile` is set with
`/sp default` and removed with `/sp unset defaultProfile`.

## Rules and validation

- Profile ids are `[A-Za-z0-9][A-Za-z0-9._-]*`, with no `..`.
- A malformed rule field invalidates the whole rule; it is never widened to a
  wildcard.
- Unknown keys are preserved; the extension reports them.
- A JSON Schema is available at
  [`schema/config.schema.json`](https://github.com/Yivas/pi-prompt-profiles/blob/main/schema/config.schema.json).
