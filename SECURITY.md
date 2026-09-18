# Security Policy

## Supported versions

This project is at `0.x`. Only the latest tagged release receives fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Scope

`pi-prompt-profiles` is a local Pi extension. It reads Markdown and JSON files
from the Pi agent directory and, when the project is trusted, from
`.pi/system-prompts` in the current project. It does not open sockets, run
commands from profile text, send telemetry or call a model.

Within scope:

- path traversal or symlink escapes from the authorized config roots;
- reading project profiles from a project that is not trusted;
- overwriting unrelated configuration fields when editing `config.json`;
- a crafted profile that is silently truncated or altered.

Out of scope:

- the trust decision itself, which belongs to Pi;
- other extensions running in the same process;
- the model's obedience to the profile instructions.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(Security → Report a vulnerability). Include the affected version, the platform,
a minimal reproduction and the impact you observed. Do not open a public issue
for a security problem, and do not include your real profiles, tokens or private
data in the report. There is no bug bounty and no promised response time.
