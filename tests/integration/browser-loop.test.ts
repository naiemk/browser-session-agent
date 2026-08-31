import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { AgentError } from "../src/domain/types.ts";
import { BrowserSession } from "../src/session.ts";
import { BrowserWorker } from "../src/worker/browser-worker.ts";
import { FixtureServer } from "./helpers/fixture-server.ts";
import { tempHome } from "./helpers/temp-home.ts";
import { createFakePi, runCommand, runTool } from "./helpers/fake-pi.ts";
import browserSessionAgent from "../src/extension.ts";
import { readWorkerInfo } from "../src/store/worker-info.ts";

interface World {
  home: string;
  cleanup: () => Promise<void>;
  server: FixtureServer;
  session: BrowserSession;
}

const worlds: World[] = [];

async function boot(): Promise<World & { origin: string }> {
  const { home, cleanup } = await tempHome();
  const server = new FixtureServer();
  const origin = await server.start();
  const session = new BrowserSession({ home, headless: true });
  const world = { home, cleanup, server, session };
  worlds.push(world);
  return { ...world, origin };
}

afterEach(async () => {
  while (worlds.length) {
    const world = worlds.pop()!;
    await world.session.worker.stop().catch(() => undefined);
    await world.server.stop().catch(() => undefined);
    await world.cleanup().catch(() => undefined);
  }
});

function refNamed(observation: { controls: Array<{ ref: string; name: string; inputType?: string }> }, needle: string) {
  const compact = needle.toLowerCase().replace(/\s+/g, "");
  const found = observation.controls.find((c) => {
    const name = c.name.toLowerCase().replace(/\s+/g, "");
    return name.includes(compact) || c.inputType?.toLowerCase() === needle.toLowerCase();
  });
  if (!found) {
    throw new Error(`No control matching ${needle}: ${observation.controls.map((c) => c.name).join(", ")}`);
  }
  return found.ref;
}

describe("persistent worker", () => {
  it("restores a cookie after Chromium relaunch on the same profile", async () => {
    const world = await boot();
    const state = await world.session.startRun("login", `${world.origin}/login`);
    const first = await world.session.inspect(state.runId);
    await world.session.act({
      action: "type",
      ref: refNamed(first, "email"),
      text: "ada@example.com",
    });
    const afterEmail = await world.session.inspect();
    await world.session.act({
      action: "type",
      ref: refNamed(afterEmail, "password"),
      text: "secret",
    });
    const afterPassword = await world.session.inspect();
    const submitted = await world.session.act({
      action: "click",
      ref: refNamed(afterPassword, "sign in"),
      expect: { urlIncludes: "/jobs" },
    });
    expect(submitted.verification.status).toBe("passed");

    await world.session.worker.stop();
    const again = new BrowserSession({ home: world.home, headless: true });
    world.session = again;
    await again.worker.start();
    const tabId = again.worker.firstTabId()!;
    await again.worker.navigate(tabId, `${world.origin}/jobs`);
    const jobs = await again.worker.inspect(tabId);
    expect(jobs.url).toContain("/jobs");
    expect(jobs.title).toBe("Jobs");
  });

  it("reconnects over CDP while Chromium is still alive", async () => {
    const world = await boot();
    await world.session.startRun("inspect login", `${world.origin}/login`);
    expect((await world.session.inspect()).url).toContain("/login");
    const pid = world.session.worker.workerInfo!.pid;
    await world.session.worker.disconnect();

    const reattached = new BrowserWorker({ home: world.home, headless: true });
    const live = await reattached.start();
    expect(live.pid).toBe(pid);
    expect((await reattached.inspect()).url).toContain("/login");
    await reattached.disconnect();
  });
});

describe("observation and actions", () => {
  it("summarizes apply, dialog, error, and dynamic pages", async () => {
    const world = await boot();
    const state = await world.session.startRun("observe", `${world.origin}/apply`);
    const apply = await world.session.inspect(state.runId);
    expect(apply.url).toContain("/apply");
    expect(apply.title).toBe("Apply");
    expect(apply.controls.some((c) => c.name.toLowerCase().includes("full name"))).toBe(true);
    expect(apply.controls.some((c) => c.name.toLowerCase().includes("submit"))).toBe(true);
    expect(JSON.stringify(apply)).not.toContain("<html");

    await world.session.act({ action: "navigate", url: `${world.origin}/dialog` });
    const dialog = await world.session.inspect();
    expect(dialog.dialogs.join(" ")).toMatch(/human/i);

    await world.session.act({ action: "navigate", url: `${world.origin}/error` });
    const errorPage = await world.session.inspect();
    expect(errorPage.errors.join(" ")).toMatch(/payment failed/i);
    expect(errorPage.consoleErrors.join(" ")).toMatch(/fixture console failure/i);

    await world.session.act({ action: "navigate", url: `${world.origin}/dynamic` });
    const before = await world.session.inspect();
    const clicked = await world.session.act({
      action: "click",
      ref: refNamed(before, "reveal"),
    });
    expect(clicked.observation.controls.some((c) => c.name.includes("Continue application"))).toBe(
      true,
    );
    expect(clicked.observation.recentChanges.some((c) => c.includes("Continue application"))).toBe(
      true,
    );
  });

  it("types, selects, submits, and verifies; missing refs fail closed", async () => {
    const world = await boot();
    await world.session.startRun("apply", `${world.origin}/apply`);
    let page = await world.session.inspect();
    await world.session.act({ action: "type", ref: refNamed(page, "full name"), text: "Ada Lovelace" });
    page = await world.session.inspect();
    await world.session.act({ action: "type", ref: refNamed(page, "email"), text: "ada@example.com" });
    page = await world.session.inspect();
    await world.session.act({ action: "select", ref: refNamed(page, "location"), value: "nyc" });
    page = await world.session.inspect();
    const done = await world.session.act({
      action: "click",
      ref: refNamed(page, "submit"),
      expect: { urlIncludes: "/apply", textVisible: "Application submitted" },
    });
    expect(done.verification.status).toBe("passed");

    const missing = await world.session
      .act({ action: "click", ref: "e999" })
      .catch((err: unknown) => err);
    expect(missing).toBeInstanceOf(AgentError);
    expect((missing as AgentError).code).toBe("missing_ref");
  });

  it("redacts password values in observations", async () => {
    const world = await boot();
    await world.session.startRun("login", `${world.origin}/login`);
    const login = await world.session.inspect();
    await world.session.act({
      action: "type",
      ref: refNamed(login, "password"),
      text: "super-secret",
    });
    const after = await world.session.inspect();
    const password = after.controls.find((c) => c.inputType === "password");
    expect(password?.value).toBe("***");
    const events = await world.session.store.events(world.session.currentRunId!);
    expect(JSON.stringify(events)).not.toContain("super-secret");
  });
});

describe("evidence, ownership, handoff, knowledge", () => {
  it("writes recovery notes and screenshots on failed expects", async () => {
    const world = await boot();
    await world.session.startRun("fail expect", `${world.origin}/apply`);
    const page = await world.session.inspect();
    const result = await world.session.act({
      action: "click",
      ref: refNamed(page, "submit"),
      expect: { textVisible: "Application submitted" },
    });
    expect(result.verification.status).toBe("failed");
    expect(result.recovery).toMatch(/not visible/i);
    expect(result.screenshotPath && existsSync(result.screenshotPath)).toBe(true);
    const events = await world.session.store.events(world.session.currentRunId!);
    expect(events.some((e) => e.type === "recovery")).toBe(true);
  });

  it("locks agent actions during takeover and resumes from a new observation", async () => {
    const world = await boot();
    const state = await world.session.startRun("handoff", `${world.origin}/apply`);
    await world.session.takeover();
    const blocked = await world.session
      .act({ action: "click", ref: "e1" })
      .catch((err: unknown) => err);
    expect(blocked).toBeInstanceOf(AgentError);
    expect((blocked as AgentError).code).toBe("ownership_error");

    const { observation } = await world.session.resume();
    expect(observation.id).toBeTruthy();
    const events = await world.session.store.events(state.runId);
    const resumeAt = events.findIndex((e) => e.type === "resume");
    const laterObs = events.findIndex((e, i) => i > resumeAt && e.type === "observation");
    expect(laterObs).toBeGreaterThan(resumeAt);

    const foreign = world.session.worker.openTab
      ? await world.session.worker.openTab(`${world.origin}/dialog`)
      : "";
    const clickForeign = await world.session
      .act({ action: "click", tabId: foreign, ref: "e1" })
      .catch((err: unknown) => err);
    expect(clickForeign).toBeInstanceOf(AgentError);
    expect((clickForeign as AgentError).code).toBe("ownership_error");
  });

  it("records CLI answers and keeps unapproved facts out of search", async () => {
    const world = await boot();
    await world.session.startRun("ask", `${world.origin}/apply`);
    const answer = await world.session.askUser("What is your full name?", undefined, "Ada Lovelace");
    expect(answer).toBe("Ada Lovelace");
    const proposed = await world.session.proposeKnowledge({
      kind: "user_fact",
      text: "Full name is Ada Lovelace",
      tags: ["name"],
    });
    expect(await world.session.knowledge.search("Ada Lovelace")).toEqual([]);
    await world.session.knowledge.setStatus(proposed.id, "approved");
    expect((await world.session.knowledge.search("Ada name"))[0]?.sourceRunId).toBe(
      world.session.currentRunId,
    );
  });
});

describe("extension tool swap and recording", () => {
  it("swaps coding tools on start and records inspect", async () => {
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    try {
      process.env.BSA_HOME = home;
      process.env.BSA_HEADLESS = "1";
      const pi = createFakePi();
      browserSessionAgent(pi);
      expect(pi.getActiveTools()).toEqual(["read", "bash", "write", "edit"]);
      await runCommand(pi, "browser-start", `--url ${origin}/apply Apply to the role`);
      expect(pi.getActiveTools().every((name) => name.startsWith("browser_"))).toBe(true);
      expect(pi.getActiveTools()).not.toContain("bash");
      const inspect = await runTool(pi, "browser_inspect", {});
      expect(inspect.isError).toBeFalsy();
      await runCommand(pi, "browser-stop", "--browser");
      expect(pi.getActiveTools()).toEqual(["read", "bash", "write", "edit"]);
    } finally {
      const info = await readWorkerInfo(home).catch(() => null);
      if (info?.pid) {
        try {
          process.kill(info.pid, "SIGTERM");
        } catch {
          // already stopped
        }
      }
      delete process.env.BSA_HOME;
      delete process.env.BSA_HEADLESS;
      await server.stop();
      await cleanup();
    }
  });
});
