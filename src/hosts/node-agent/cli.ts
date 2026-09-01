#!/usr/bin/env node
import { NodeAgent } from "./client.ts";
import { loadDeviceCredential, saveDeviceCredential } from "./credentials.ts";

function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const env = process.env[`BSA_${name.toUpperCase().replaceAll("-", "_")}`];
  return env ?? fallback;
}

function httpOriginFromNodeUrl(api: string): string {
  const url = new URL(api);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.origin;
}

const api = arg("api", process.env.BSA_API_URL);
if (!api) {
  console.error("Usage: browser-session-node --api wss://agent.trustless-commerce.com/node");
  console.error("Pair with BSA_PAIR_CODE=… or a stored device token under BSA_HOME.");
  process.exit(1);
}

const home = arg("home", process.env.BSA_HOME);
const pairCode = arg("pair-code", process.env.BSA_PAIR_CODE);
let deviceToken = arg("device-token");
const sharedToken = arg("token", process.env.BSA_TOKEN);

if (pairCode) {
  const origin = httpOriginFromNodeUrl(api);
  const res = await fetch(`${origin}/pair/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: pairCode, hostname: process.env.HOSTNAME }),
  });
  if (!res.ok) {
    console.error(`pair exchange failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = (await res.json()) as { deviceToken: string; deviceId?: string; accountId?: string };
  deviceToken = body.deviceToken;
  await saveDeviceCredential(
    { deviceToken: body.deviceToken, deviceId: body.deviceId, accountId: body.accountId },
    home,
  );
}

if (!deviceToken && !sharedToken) {
  const stored = await loadDeviceCredential(home);
  deviceToken = stored?.deviceToken;
}

if (!deviceToken && !sharedToken) {
  console.error("No device token or BSA_TOKEN. Pair with --pair-code or localhost claim.");
  process.exit(1);
}

const agent = new NodeAgent({
  apiUrl: api,
  token: sharedToken,
  deviceToken,
  home,
  headless: process.env.BSA_HEADLESS === "1" || process.argv.includes("--headless"),
});

agent.start();
console.error(`browser-session-node connecting to ${api}`);

const shutdown = async () => {
  await agent.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
