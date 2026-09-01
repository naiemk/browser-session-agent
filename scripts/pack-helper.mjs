#!/usr/bin/env node
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "dist", "helper-layout");

await rm(dest, { recursive: true, force: true });
await mkdir(path.join(dest, "bin"), { recursive: true });
await mkdir(path.join(dest, "manifests"), { recursive: true });

await cp(path.join(root, "bin", "browser-session-node.mjs"), path.join(dest, "bin", "browser-session-node.mjs"));
await cp(path.join(root, "deploy", "helper"), path.join(dest, "manifests"), { recursive: true });

await writeFile(
  path.join(dest, "README.md"),
  `# Browser Session Agent helper layout (unsigned)

This folder is a CI-built helper layout, not a signed installer.

## Entry

- \`bin/browser-session-node.mjs\` — desktop node entry (\`browser-session-node\`)
- Pair with a \`bsa://\` code or \`--pair-code\`. Do not set \`BSA_TOKEN\` for consumers.

## Playwright Chromium

The helper launches Chromium via Playwright on the user PC.

    npx playwright install chromium

Place Chromium in Playwright's cache, or set \`PLAYWRIGHT_BROWSERS_PATH\` next to this layout. The hosted API does not ship a browser.

## Profile

- Windows: \`%APPDATA%\\browser-session-agent\`
- macOS: \`~/Library/Application Support/browser-session-agent\`

Device credentials are written after pairing. This layout contains no \`.env\`, no \`BSA_TOKEN\`, and no baked device token.
`,
);

console.error(`wrote ${dest}`);
