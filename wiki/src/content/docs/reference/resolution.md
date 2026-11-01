---
title: Resolution
description: How the active profile is chosen for a model.
---

## Selection precedence

```text
session (flag or /sp use) > trusted project config > global config > auto
```

A session value is stored as a custom session entry and restored from the active
branch on resume and tree navigation.

## Auto mode

```text
1. project bindings
2. global bindings        (unless the project sets inheritGlobalBindings: false)
3. project defaultProfile
4. global defaultProfile
5. none                   (Pi keeps its native prompt)
```

Explicit rules come before defaults, even when the rule is global and the default
is local.

## Within one scope

1. Higher `priority` wins.
2. Then the most specific matching rule:

   | Specificity | Provider | Model |
   | ----------- | -------- | ----- |
   | 3 | exact | exact |
   | 2 | wildcard | exact |
   | 1 | exact | wildcard |
   | 0 | wildcard | wildcard |

3. If two rules still tie and point at different profiles, the extension reports
   a conflict and applies **no** binding from that scope. A project conflict does
   not fall through to global bindings.

Changing the profile never changes the model, provider, thinking level or
permissions.

## Composition

The specific profile is emitted first, then its bases; where they conflict, the
specific one wins. The extension writes no heading, id or scope into the prompt,
so the block carries no identifier for the active profile. This is prompt text:
it does not create a privileged message type at the API level.

Composition is idempotent: the extension removes its own leading block and
prepends exactly one, so the prompt never accumulates duplicates.

The block is resolved once at the start of a run and returned as the complete
prompt. Pi applies it as the request's system message, and extensions chain that
value, so an extension that appends keeps the block in either load order. A
leading managed block is removed before one is prepended, so it appears exactly
once, and it is not persisted in the transcript. Off removes it on the next run.

While a profile is active, Pi cannot apply its native system-section deltas to
that prompt: adding a tool during a run rebuilds the system header, prompt
snippets and guidelines of a tool activated mid-run are absent until the next
run, and a structured section contributed by an extension that runs later is not
part of that run's request. With no profile, Pi keeps its own prompt and deltas.
An extension that replaces the prompt after this one can still discard the
block; the extension then warns that the selected profile was not found in the
request.

## Subagents

A subagent is its own session, so it resolves from the config, not from the
parent's pin. The `subagents` key decides what it may apply: `bindings` (the
default) only an explicit binding for the child's model, `inherit` the normal
resolution including `defaultProfile`, and `off` nothing. This only recognizes
subagents that mark their process; a foreground child that does not load ambient
extensions never sees the block at all.

## Observation

Three different things are reported separately by `/sp status`:

- the pending selection;
- the profile prompt composed in `before_agent_start`;
- the payload observed read-only in `before_provider_request`.

The footer reports `not in payload` when a recognized request lacks the block,
or `payload unverified` when its format cannot be checked. Neither selection
nor an estimate proves delivery. See [Compatibility](../compatibility/) for
what the observation can and cannot prove.
