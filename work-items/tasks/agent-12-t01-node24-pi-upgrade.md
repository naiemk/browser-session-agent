---
id: AGENT-12-T01
title: Upgrade the runtime to Node 24 and Pi 0.85
story: AGENT-12
epic: agent
status: done
---

# AGENT-12-T01 — Upgrade the runtime to Node 24 and Pi 0.85

## Why

The project currently declares Node 22 and pins the Pi package family at `0.84.4`.
Pi Fabric requires Node 24, and its current release line is built against Pi `0.85.1`.
The Node and Pi upgrades are useful maintenance independently of the Fabric experiment,
so they land as their own change and become the experiment's clean baseline.

Versions observed on 8 September 2026:

- local development runtime: Node `24.1.0`;
- latest `@earendil-works/pi-agent-core`, `pi-ai`, and `pi-coding-agent`: `0.85.1`;
- those Pi packages require Node `>=22.19.0`;
- Pi Fabric requires Node `>=24`.

Resolve the latest compatible patch releases again when the task starts. Do not combine
this task with adding Pi Fabric.

## Spec

- [package.json](../../package.json) — runtime and Pi package declarations.
- [docs/decisions.md](../../docs/decisions.md) — D17, D19, D29, D56.
- [AGENT-12-T02](agent-12-t02-fabric-execution-rd.md) — depends on this upgrade.
- Pi `0.85.1` release notes — notably fixes the accidentally published `0.85.0`
  experimental SDK surface; do not target `0.85.0`.

## Discovery

1. Read the Pi changelog from `0.84.4` through the selected release. List changes to:
   extension lifecycle, registered tools, active-tool selection, session events, model
   metadata, compaction, RPC, and package exports.
2. Run `npm ls` before the upgrade and record duplicate Pi and TypeBox versions.
3. Search every runtime declaration, installer, container, workflow, and test for Node 22.
4. Confirm that the selected portable Node build exists for every architecture supported
   by `install.sh` and `install.ps1`.
5. Capture a pre-upgrade result from `npm run precommit` and the local CLI smoke test.

## Do

1. Raise the package engine and local runtime check to Node 24.
2. Update all runtime surfaces together:
   - `.github/workflows/ci.yml`, `baseline.yml`, and `release.yml`;
   - `deploy/docker/Dockerfile.node`, `deploy/docker/Dockerfile.api`, and
     `deploy/vibed/Dockerfile.api`;
   - portable Node defaults in `src/hosts/web/public/install.sh` and `install.ps1`;
   - any user-facing installation documentation or package tests that state Node 22.
3. Upgrade `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and
   `@earendil-works/pi-coding-agent` in lockstep to the same exact release line. Keep the
   three direct dependencies aligned; do not allow the lockfile to resolve mixed Pi
   versions.
4. Update `@types/node` to the Node 24 type line. Change TypeScript or TypeBox only when
   required by a demonstrated compatibility failure, and record that reason in the PR.
5. Regenerate `package-lock.json` with Node 24 and a clean install.
6. Fix only compatibility regressions caused by the upgrade. Put unrelated cleanup in
   separate work.
7. Record the chosen Node patch, Pi version, package tree, and migration notes in the task
   or PR evidence.

## Compatibility checks

- Loading the local Pi TUI still registers the browser extension exactly once.
- `getActiveTools` / `setActiveTools` composition still works across ordinary chat,
  plan mode, job planning, and exit in either order.
- Model changes and `before_agent_start` metering still produce valid records.
- The local, hosted API, and node-helper entry points start under Node 24.
- A published-package smoke install resolves its own declared imports rather than relying
  on a hoisted development dependency.
- Existing persisted goal and job JSON remains readable; this task performs no storage
  migration.

## Tests

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run suite:reference`
- `npm run suite`
- `npm run cli -- --check`
- Build both Docker images used by the API and desktop node.
- Run the package-consumer smoke test under Node 24.
- Run the plan-mode/job capability-order tests.

Add focused assertions that:

- the minimum runtime is 24 in both `package.json` and the local CLI check;
- all three direct Pi packages resolve to the selected version;
- CI, release, Docker, and portable installer defaults no longer select Node 22.

## Evidence

Attach:

- before/after `npm ls` for the Pi family and TypeBox;
- the exact Node and npm versions used to regenerate the lockfile;
- precommit output;
- CLI startup and one no-op browser session;
- container build results;
- any Pi API migration found during discovery.

## Discussion and decision

- Is Node 24 acceptable for every currently supported installation path?
- Did the Pi upgrade change active-tool or extension event ordering?
- Should Pi dependencies remain caret ranges, or should the project pin exact versions
  because extension APIs are operationally coupled?
- Did aligning TypeBox remove duplication without forcing an unrelated schema migration?

## Done when

Node 24 is the consistent minimum across package metadata, CI, containers, installers, and
runtime checks; the direct Pi packages resolve in lockstep; clean-install and precommit
checks pass; and the Fabric experiment can branch from this revision without carrying an
unrelated platform migration.
