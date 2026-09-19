---
title: Compatibility
description: Verified Pi contracts, the supported version and known limits.
---

This extension is verified against `@earendil-works/pi-coding-agent` **0.85.1**.
No other version is claimed to work. The full audit, with file references, is in
[`docs/compatibility.md`](https://github.com/Yivas/pi-prompt-profiles/blob/main/docs/compatibility.md).

## Contracts used

| Hook | Use |
| ---- | --- |
| `session_start` | Load disk state, restore or apply the selection. |
| `session_tree` | Restore the selection from the active branch. |
| `model_select` | Invalidate the cached resolution. |
| `before_agent_start` | Prepend the managed block to the chained system prompt. |
| `before_provider_request` | Observe the payload; never rewrite it. |
| `session_shutdown` | Drop cached state. |

The extension also uses `registerCommand`, `registerFlag`/`getFlag`,
`appendEntry`, `ctx.sessionManager.getBranch()`, `ctx.isProjectTrusted()`,
`ctx.model`, `ctx.modelRegistry`, `ctx.mode` and `ctx.ui` (`select`, `input`,
`editor`, `custom`, `notify`, `setStatus`). It does not import internal paths or
touch private properties.

## System prompt

Returning `systemPrompt` from `before_agent_start` replaces the prompt for the
turn and is chained across extensions. This extension reads the current value,
removes its own leading block and prepends one, so everything Pi composed stays
below. It never sets `customPrompt`, which would drop Pi's native tool and
documentation instructions.

`forceSystemPrompt` does not exist in 0.85.1.

## Known limits

- A later extension that returns a full replacement `systemPrompt` discards the
  managed block. This is documented and covered by a test; there is no priority
  field on events.
- Provider adapters serialize the system prompt their own way. The extension
  observes the payload best-effort and does not impose a field.
- The profile is frozen per prompt. A model change during an active run applies
  on the next run; the extension does not abort streaming to swap instructions.
- A restored session reads the current file on disk, not the version that existed
  when the session was written.

## Pickers

Pi's extension selector (`ctx.ui.select`) renders every option it receives and
has no filter or scroll, so a long list pushes the dialog off the screen. This
extension only uses it for very short fixed lists. In `ctx.mode === "tui"` it
shows a custom component through `ctx.ui.custom` that filters as you type and
sizes its rows to the terminal; in other modes it pages `ctx.ui.select` ten
options at a time.

## Errors

If the config is invalid, the version is unknown, a profile is missing or an
inheritance chain is broken, the extension reports the problem and Pi keeps its
native prompt. It never claims a profile is active when it is not.
