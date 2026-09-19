---
title: Install
description: Load pi-prompt-profiles in Pi, locally or as a package.
---

## Requirements

- Pi, verified against `@earendil-works/pi-coding-agent` 0.85.1.
- Node.js 22.19 or newer if you build from source.

## Try it without installing

From your project directory:

```bash
pi -e /path/to/pi-prompt-profiles
```

`-e` loads the extension for the current run only. Your Pi settings are not
modified.

## Install it

From npm:

```bash
pi install npm:pi-prompt-profiles
```

From a local checkout:

```bash
pi install /path/to/pi-prompt-profiles
```

This writes the package to your Pi settings. To keep it project-local:

```bash
pi install -l /path/to/pi-prompt-profiles
```

## What it reads

The extension reads Markdown from two locations and never touches anything else:

```text
<agentDir>/system-prompts/
├── config.json
└── profiles/
    └── base.md

<projectDir>/.pi/system-prompts/
├── config.json
└── profiles/
    └── local.md
```

`<agentDir>` is what Pi resolves for `getAgentDir()`, normally `~/.pi/agent`.
Project files are read only when the project is trusted.

## Uninstall

```bash
pi remove /path/to/pi-prompt-profiles
```

Uninstalling does not delete your profiles or config. Delete the
`system-prompts/` folders yourself if you want to remove the data.

## Next

[Write your first profile](/pi-prompt-profiles/guides/first-profile/) and see it
applied to Pi.
