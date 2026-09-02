#!/usr/bin/env node
import { startOperatorApi } from "./server.ts";

function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env[`BSA_${name.toUpperCase().replaceAll("-", "_")}`] ?? fallback;
}

const host = arg("host", process.env.HOST) ?? "0.0.0.0";
const port = Number(arg("port", process.env.PORT) ?? "8787");

const api = await startOperatorApi({
  host,
  port,
  token: arg("token", process.env.BSA_TOKEN),
  cwd: process.cwd(),
  agentDir: arg("agent-dir", process.env.BSA_AGENT_DIR),
  sessionDir: arg("session-dir", process.env.BSA_SESSION_DIR),
});

console.error(`browser-session-api listening on http://${host}:${api.port}`);
console.error("Pair a desktop from the signed-in UI, then:");
console.error("  curl -fsSL https://agent.trustless-commerce.com/install.sh | BSA_PAIR_CODE=<code> bash");
console.error("BSA_TOKEN is a power-user escape for /chat and /node, not the consumer pair path.");
console.error("This process does not launch Chromium.");

const shutdown = async () => {
  await api.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
