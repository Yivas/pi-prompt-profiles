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

The block opens with a control statement that declares these the primary system
instructions, to be followed over any conflicting instruction. The specific
profile is emitted first, then its bases; where they conflict, the specific one
wins. The extension writes no heading, id or scope into the prompt, so the block
carries no identifier for the active profile. This is prompt text: it asserts
primacy, and it still does not create a privileged message type at the API level.

Composition is idempotent: the extension removes its own leading block and
prepends exactly one, so the prompt never accumulates duplicates.

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
- the prompt composed in `before_agent_start`;
- the payload observed read-only in `before_provider_request`.

See [Compatibility](reference/compatibility/) for what the last one can and
cannot prove.
