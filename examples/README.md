# Examples

These files are fictional and safe to copy. They show the layout the extension
reads from disk.

- `system-prompts/config.json` → `<agentDir>/system-prompts/config.json`
- `system-prompts/profiles/base.md` → `<agentDir>/system-prompts/profiles/base.md`
- `system-prompts/profiles/review.md` → `<agentDir>/system-prompts/profiles/review.md`

`review` inherits `base`. The profile that is applied first is `review`, then
its base, and the specific one wins when they conflict.

Nothing here uses a real model version. The bindings match by provider and by a
`deepseek/*` model pattern so the example keeps working when model ids change.
