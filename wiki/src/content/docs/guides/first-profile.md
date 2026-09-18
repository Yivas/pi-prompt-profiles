---
title: Your first profile
description: Write a Markdown profile and see it applied to Pi.
---

## Create the folders

```text
<agentDir>/system-prompts/
├── config.json
└── profiles/
```

## Write a profile

Create `profiles/base.md`. The file name is the profile id, and its content is
the body that will be added to the system prompt.

```markdown
Work in small, verifiable steps. State your assumption when a request is
ambiguous, and ask before changing scope.
```

## Point the config at it

Create `config.json` next to `profiles/`:

```json
{
	"version": 1,
	"selection": { "mode": "auto" },
	"defaultProfile": "global:base"
}
```

## Reload and check

In Pi, run `/sp reload` and then `/sp status`. The status line should show the
active profile.

## Switch profiles

Add a second file, for example `profiles/review.md`, then:

- run `/sp` and pick it from the menu, or
- run `/sp use review`.

The change applies on the next run. To remove the pin, run `/sp auto`. To turn
the manager off for the session, run `/sp off`.

## Inherit a base

A profile can extend one parent with `extends`. Metadata lives in `config.json`,
not in frontmatter:

```json
{
	"version": 1,
	"profiles": {
		"base": { "description": "General working agreements." },
		"review": { "extends": "global:base", "description": "Careful review." }
	}
}
```

`review` is emitted first, then `base`. The specific profile wins where they
conflict.
