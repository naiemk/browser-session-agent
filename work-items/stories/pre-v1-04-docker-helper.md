# PRE-04: Docker Playwright Helper

Status: done

As the operator, I pull the node image, pair this machine, see **Connected**, and survive restart without `BSA_TOKEN` and without a Win/Mac installer.

## Acceptance criteria

- `ghcr.io/naiemk/browser-session-node` (or local build) runs with `BSA_HOME` bind-mounted.
- Pair via issued code (`BSA_PAIR_CODE` / `--pair-code`) or localhost claim → device token on disk.
- `/node` hello uses the device token; UI shows Connected.
- Kill and relaunch with the same volume reconnects; env has no `BSA_TOKEN`.
- Compose/scripts do not require `BSA_TOKEN` for this path.
- Default is headless; live view is the takeover surface (D14).
- The API process still does not launch Chromium (D11).

## Decisions

See `docs/pre-v1.md` and `docs/decisions.md` D11, D14. Docker is the Pre-V1 helper, not a consumer MSI.

## Tasks

- [PRE-04-T01](../tasks/pre-v1-04-t01-docker-helper.md)

## Tests

Compose/script contracts plus pair/reconnect (may reuse the helper child). See `docs/test-design.md` (PRE-04).
