---
title: Compatibility
description: Verified Pi contracts, the supported version and known limits.
---

Version 0.11.0 has an offline transport matrix for Pi **0.85.1** and **1.4.0**;
other versions are unverified. The full audit, with file references, is in
[`docs/compatibility.md`](https://github.com/Yivas/pi-prompt-profiles/blob/main/docs/compatibility.md).

## Contracts used

| Hook | Use |
| ---- | --- |
| `session_start` | Load disk state, restore or apply the selection. |
| `session_tree` | Restore the selection from the active branch. |
| `model_select` | Invalidate the cached resolution. |
| `before_agent_start` | Freeze the profile block; prepend the legacy prompt. |
| `context_with_system` (1.4+) | Prepend to the request-local structured system header. |
| `before_provider_request` | Observe the payload; never rewrite it. |
| `session_shutdown` | Drop cached state. |

The extension also uses `registerCommand`, `registerFlag`/`getFlag`,
`appendEntry`, `ctx.sessionManager.getBranch()`, `ctx.isProjectTrusted()`,
`ctx.model`, `ctx.modelRegistry`, `ctx.mode` and `ctx.ui` (`select`, `input`,
`editor`, `custom`, `notify`, `setStatus`). It does not import internal paths or
touch private properties.

## System prompt

On Pi 0.85.1 the extension returns a complete `systemPrompt` from
`before_agent_start`, chained across extensions. This legacy path cannot
preserve deltas that Pi itself does not provide; `forceSystemPrompt` does not
exist in that version.

The Pi 1.4+ path freezes the block before the run and prepends it
through `context_with_system`. It preserves native sections, tool declarations
and later updates without writing the profile to the transcript. It never sets
`customPrompt`, which would drop native tool and documentation instructions.

The offline Anthropic matrix compares native, off and active requests with and
without intermediate-system/tool capabilities. It proves payload structure,
not real cache hits, quota or billing.

## Known limits

- On Pi 1.4+, **any extension returning a complete `systemPrompt` can discard
  the profile**, including an appender, in either load order. Pi applies that
  forced replacement after the transcript hook. Use structured section
  contributions to avoid it. On legacy Pi only a later full replacement has
  that effect; appenders preserve the block.
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
native prompt. Selection is not proof of delivery: a recognized payload missing
the frozen block produces a warning once per run and `not in payload` in the
footer. An unrecognized format reports `payload unverified`.
