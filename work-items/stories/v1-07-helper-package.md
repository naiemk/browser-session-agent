# V1-07: Helper I Can Double-Click

Status: planned

As a non-developer, I install a helper on Windows or Mac (no terminal, no Docker). Linux CI proves the same binary behavior and installer contracts.

## Acceptance criteria

- The helper binary can pair, store a device credential (fake keychain in CI), connect, and survive restart without `BSA_TOKEN` in the environment.
- Installer manifests declare `bsa://`, a login item / Run-at-login, and profile paths under AppData / Application Support.
- The installer / layout contains no baked long-lived secret.
- CI may publish unsigned win/mac helper layouts. Signed/notarized MSI/pkg is a release artifact, not this story’s CI gate.

## Decisions

See `docs/v1.md` packaging and `docs/decisions.md` D14, D15. Docker remains a power-user image.

## Tasks

- [V1-07-T01](../tasks/v1-07-t01-helper-binary-pairing.md)
- [V1-07-T02](../tasks/v1-07-t02-installer-contracts.md)
- [V1-07-T03](../tasks/v1-07-t03-ci-unsigned-artifacts.md)

## Tests

Helper child + fake keychain; manifest fixture assertions; CI artifact layout smoke. See `docs/test-design.md` (V1-07).
