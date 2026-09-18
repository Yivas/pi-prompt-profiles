---
title: Troubleshooting
description: Common problems and how to diagnose them.
---

## The profile is not applied

1. Run `/sp status`. If it shows `SP: auto (none)`, nothing matched the current
   model.
2. Run `/sp validate` to see configuration problems.
3. Check that `selection` is not `off` and that `defaultProfile` points at an
   existing profile.
4. Run `/sp reload` after editing files on disk.

## A profile is not listed

- The file must be `profiles/<id>.md`, with a safe id and the `.md` extension.
- A project file is listed only when the project is trusted.
- A profile whose body contains a reserved managed-block marker is skipped with a
  diagnostic, so it cannot corrupt the prompt.

## Two profiles conflict

If two bindings with the same priority and the same specificity point at
different profiles, the extension reports a conflict and applies no binding from
that scope. Adjust `priority` or make one rule more specific.

## Another extension removes my block

An extension that returns a full replacement `systemPrompt` after this one wins.
There is no priority field on events. Use `/sp preview` and the last payload
observation to confirm what happened.

## Editing `config.json` fails

The extension refuses to write when the file changed on disk since it was read.
Run `/sp reload` and try again.

## Still stuck

Run `/sp why` and `/sp preview`, then open an issue with the Pi version, your
operating system and the exact output. Remove private text before posting.
Security problems follow [SECURITY.md](https://github.com/Yivas/pi-prompt-profiles/blob/main/SECURITY.md).
