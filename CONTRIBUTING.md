# Contributing

Contributions are welcome through GitHub issues and pull requests.

## Before you start

- Check that the change fits the documented scope in `README.md` and
  `docs/architecture.md`.
- Read `docs/compatibility.md` before touching anything that depends on the Pi
  extension API. The documented contracts come from the installed Pi version.
- Never paste real profiles, tokens, endpoints, session IDs or logs into an
  issue, a pull request or a test fixture. Use synthetic examples.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
```

The test suite runs against the installed Pi packages and uses a simulated
provider payload. It does not need an API key and does not send data anywhere.

## Pull requests

- Keep one coherent change per pull request.
- Add or update tests for behavior changes.
- Run `npm run format`, `npm run lint`, `npm run typecheck` and `npm test`.
- Describe what changed, why, and how you verified it.
- Do not add dependencies without a concrete reason.

## Reporting bugs

Open an issue with the Pi version, the operating system, the exact command, the
expected result and the observed result. Remove private data before posting.

Security reports follow `SECURITY.md`, not the public issue tracker.

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
