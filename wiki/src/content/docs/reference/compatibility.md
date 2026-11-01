---
title: Compatibility
description: Verified Pi contracts, the supported version and known limits.
---

Version 0.11.1 has an offline transport matrix for Pi **0.85.1** and **1.4.0**;
other versions are unverified. The full audit, with file references, is in
[`docs/compatibility.md`](https://github.com/Yivas/pi-prompt-profiles/blob/main/docs/compatibility.md).

## Contracts used

| Hook | Use |
| ---- | --- |
| `session_start` | Load disk state, restore or apply the selection. |
| `session_tree` | Restore the selection from the active branch. |
| `model_select` | Invalidate the cached resolution. |
| `before_agent_start` | Resolve the profile and return the complete prompt. |
| `before_provider_request` | Observe the payload; never rewrite it. |
| `session_shutdown` | Drop cached state. |

The extension also uses `registerCommand`, `registerFlag`/`getFlag`,
`appendEntry`, `ctx.sessionManager.getBranch()`, `ctx.isProjectTrusted()`,
`ctx.model`, `ctx.modelRegistry`, `ctx.mode` and `ctx.ui` (`select`, `input`,
`editor`, `custom`, `notify`, `setStatus`). It does not import internal paths or
touch private properties.

## System prompt

The extension returns a complete `systemPrompt` from `before_agent_start` on
every supported version, chained across extensions. Pi 0.85.1 uses it as the
turn's prompt. Pi 1.4.0 records it as `forceSystemPrompt` and projects it as the
request's system message after every hook, so another extension that appends to
`event.systemPrompt` keeps the block in either load order. A leading managed
block already present is removed before one is prepended, so the block appears
once.

A forced prompt carries no sections: while a profile is active, adding a tool
during a run rebuilds the system header, prompt snippets and guidelines of a
tool activated mid-run are absent until the next run, and a structured section
contributed by an extension that runs later is not part of that run's request.
With no profile selected, Pi keeps its own prompt and deltas. The extension
never sets `customPrompt`, which would drop native tool and documentation
instructions.

The offline Anthropic matrix compares native, off and active requests with and
without intermediate-system/tool capabilities. It proves payload structure,
not real cache hits, quota or billing.

## Known limits

- Appenders keep the block in either load order. An extension that returns its
  own complete `systemPrompt` after this one, instead of appending, replaces the
  chained value and can discard the block. A recognized payload without the
  block produces a warning and `not in payload` in the footer.
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
the managed block produces a warning once per run and `not in payload` in the
footer. An unrecognized format reports `payload unverified`.
