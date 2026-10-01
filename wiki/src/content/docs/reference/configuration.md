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
`description` is shown in the picker. `controlText` decides whether the managed
block keeps its opening control statement.

### `profiles.<id>.controlText`

Where the managed block keeps the control statement it opens with.

- `full` (default): the block opens with the statement that declares the profile
the primary system instructions.
- `none`: the block carries the profile bodies only. The heading, the primacy
claim and the explanation of inheritance are all dropped.

The key sits next to the profile's other metadata in `config.json`. This is a
complete, valid file that turns the statement off for `base`:

```json
{
	"version": 1,
	"selection": { "mode": "auto" },
	"defaultProfile": "global:base",
	"profiles": { "base": { "controlText": "none" } }
}
```

Only the selected profile's own metadata is read. `controlText` is never
inherited from an `extends` parent: a profile without the key keeps `full` even
when the profile it extends sets `none`.

Either value leaves the rest of the block intact. The begin and end markers that
delimit the managed block stay in place, and so do the profile bodies and their
order, specific profile first and then its bases. The markers matter because the
extension finds and removes its own block by matching them before writing the
new one; that is what keeps composition idempotent and prevents the prompt from
accumulating duplicates.

The key is not a `/sp set` key; it has its own command. `/sp control-text` opens
a `full`/`none` picker that marks the current value, and
`/sp control-text full|none` writes it directly. Both target the profile that is
active now, write to that profile's own config and apply without `/sp reload`.
Editing the key by hand still works: change `config.json`, run `/sp reload`, then
`/sp preview` to see the block that will be sent.

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
