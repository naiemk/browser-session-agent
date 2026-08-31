#!/usr/bin/env npx tsx
import { runBrowserPrompt } from "../src/operator/run-prompt.ts";
import { FixtureServer } from "../tests/helpers/fixture-server.ts";
import { tempHome } from "../tests/helpers/temp-home.ts";

const live = process.argv.includes("--live");
const messy = '{"name":"Ada Lovelace","skills":["math","programming"],"active":true,"years":36}';

async function main(): Promise<void> {
  const { home, cleanup } = await tempHome();
  const server = live ? null : new FixtureServer();
  const origin = server ? await server.start() : "";
  const target = live ? "https://jsonlint.com/" : `${origin}/jsonlint`;
  const prompt = `
Create an unformatted JSON document, open JSONLint, validate it, prettify it, and copy the formatted JSON back.

JSON:
${messy}

Open: ${target}
`.trim();

  console.error(`Prompt target: ${target}`);
  const result = await runBrowserPrompt(prompt, { home, headless: true });
  await server?.stop().catch(() => undefined);
  await cleanup().catch(() => undefined);

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(result.copiedText);
  console.error(`steps=${result.steps.length} url=${result.url} screenshot=${result.screenshotPath ?? ""}`);
}

await main();
