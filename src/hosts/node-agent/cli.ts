#!/usr/bin/env node
import { NodeAgent } from "./client.ts";

function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const env = process.env[`BSA_${name.toUpperCase().replaceAll("-", "_")}`];
  return env ?? fallback;
}

const api = arg("api", process.env.BSA_API_URL);
if (!api) {
  console.error("Usage: browser-session-node --api wss://api.example.com/node --token <secret>");
  process.exit(1);
}

const agent = new NodeAgent({
  apiUrl: api,
  token: arg("token", process.env.BSA_TOKEN),
  home: arg("home", process.env.BSA_HOME),
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
