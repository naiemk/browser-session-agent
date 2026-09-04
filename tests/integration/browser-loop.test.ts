import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { AgentError } from "../../src/domain/types.ts";
import { BrowserSession } from "../../src/session.ts";
import { FixtureServer } from "../helpers/fixture-server.ts";
import { tempHome } from "../helpers/temp-home.ts";
import { createFakePi, runCommand, runTool } from "../helpers/fake-pi.ts";
import browserSessionAgent from "../../src/extension.ts";
import { TOOL_ACT, TOOL_OBSERVE, TOOL_PEEK, TOOL_SURVEY } from "../../src/runtime/names.ts";
import { readWorkerInfo } from "../../src/store/worker-info.ts";

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
    await Promise.race([world.cleanup(), new Promise((resolve) => setTimeout(resolve, 500))]);
  }
});

function refNamed(
  observation: { controls: Array<{ ref: string; name: string; inputType?: string }> },
  needle: string,
) {
  const compact = needle.toLowerCase().replace(/\s+/g, "");
  const found = observation.controls.find((c) => {
    const name = c.name.toLowerCase().replace(/\s+/g, "");
    return name.includes(compact) || c.inputType?.toLowerCase() === needle.toLowerCase();
  });
  if (!found) {
    throw new Error(
      `No control matching ${needle}: ${observation.controls.map((c) => c.name).join(", ")}`,
    );
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
    assert.equal(submitted.verification.status, "passed");

    await world.session.worker.stop();
    const again = new BrowserSession({ home: world.home, headless: true });
    world.session = again;
    await again.worker.start();
    const tabId = again.worker.firstTabId()!;
    await again.worker.navigate(tabId, `${world.origin}/jobs`);
    const jobs = await again.worker.inspect(tabId);
    assert.match(jobs.url, /\/jobs/);
    assert.equal(jobs.title, "Jobs");
  });

  it("exposes a CDP endpoint while Chromium is still alive", async () => {
    const world = await boot();
    await world.session.startRun("inspect login", `${world.origin}/login`);
    assert.match((await world.session.inspect()).url, /\/login/);
    const info = world.session.worker.workerInfo!;
    const response = await fetch(`${info.cdpUrl}/json/version`);
    assert.equal(response.ok, true);
    const body = (await response.json()) as { Browser?: string };
    assert.ok(body.Browser);
  });
});

describe("observation and actions", () => {
  it("summarizes apply, dialog, error, and dynamic pages", async () => {
    const world = await boot();
    const state = await world.session.startRun("observe", `${world.origin}/apply`);
    const apply = await world.session.inspect(state.runId);
    assert.match(apply.url, /\/apply/);
    assert.equal(apply.title, "Apply");
    assert.ok(apply.controls.some((c) => c.name.toLowerCase().includes("full name")));
    assert.ok(apply.controls.some((c) => c.name.toLowerCase().includes("submit")));
    assert.equal(JSON.stringify(apply).includes("<html"), false);

    await world.session.act({ action: "navigate", url: `${world.origin}/dialog` });
    const dialog = await world.session.inspect();
    assert.match(dialog.dialogs.join(" "), /human/i);

    await world.session.act({ action: "navigate", url: `${world.origin}/error` });
    const errorPage = await world.session.inspect();
    assert.match(errorPage.errors.join(" "), /payment failed/i);
    assert.match(errorPage.consoleErrors.join(" "), /fixture console failure/i);

    await world.session.act({ action: "navigate", url: `${world.origin}/dynamic` });
    const before = await world.session.inspect();
    const clicked = await world.session.act({
      action: "click",
      ref: refNamed(before, "reveal"),
    });
    assert.ok(clicked.observation.controls.some((c) => c.name.includes("Continue application")));
    assert.ok(clicked.observation.recentChanges.some((c) => c.includes("Continue application")));
  });

  it("types, selects, submits, and verifies; missing refs fail closed", async () => {
    const world = await boot();
    await world.session.startRun("apply", `${world.origin}/apply`);
    let page = await world.session.inspect();
    await world.session.act({
      action: "type",
      ref: refNamed(page, "full name"),
      text: "Ada Lovelace",
    });
    page = await world.session.inspect();
    await world.session.act({
      action: "type",
      ref: refNamed(page, "email"),
      text: "ada@example.com",
    });
    page = await world.session.inspect();
    await world.session.act({
      action: "select",
      ref: refNamed(page, "location"),
      value: "nyc",
    });
    page = await world.session.inspect();
    const done = await world.session.act({
      action: "click",
      ref: refNamed(page, "submit"),
      expect: { urlIncludes: "/apply", textVisible: "Application submitted" },
    });
    assert.equal(done.verification.status, "passed");

    await assert.rejects(
      () => world.session.act({ action: "click", ref: "e999" }),
      (err: unknown) => {
        assert.ok(err instanceof AgentError);
        assert.equal(err.code, "missing_ref");
        return true;
      },
    );
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
    assert.equal(password?.value, "***");
    const events = await world.session.store.events(world.session.currentRunId!);
    assert.equal(JSON.stringify(events).includes("super-secret"), false);
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
    assert.equal(result.verification.status, "failed");
    assert.match(result.recovery ?? "", /not visible/i);
    assert.equal(Boolean(result.screenshotPath && existsSync(result.screenshotPath)), true);
    const events = await world.session.store.events(world.session.currentRunId!);
    assert.ok(events.some((e) => e.type === "recovery"));
  });

  it("locks agent actions during takeover and resumes from a new observation", async () => {
    const world = await boot();
    const state = await world.session.startRun("handoff", `${world.origin}/apply`);
    await world.session.takeover();
    await assert.rejects(
      () => world.session.act({ action: "click", ref: "e1" }),
      (err: unknown) => {
        assert.ok(err instanceof AgentError);
        assert.equal(err.code, "ownership_error");
        return true;
      },
    );

    const { observation } = await world.session.resume();
    assert.ok(observation.id);
    const events = await world.session.store.events(state.runId);
    const resumeAt = events.findIndex((e) => e.type === "resume");
    const laterObs = events.findIndex((e, i) => i > resumeAt && e.type === "observation");
    assert.ok(laterObs > resumeAt);

    const foreign = await world.session.worker.openTab(`${world.origin}/dialog`);
    await assert.rejects(
      () => world.session.act({ action: "click", tabId: foreign, ref: "e1" }),
      (err: unknown) => {
        assert.ok(err instanceof AgentError);
        assert.equal(err.code, "ownership_error");
        return true;
      },
    );
  });

  it("records CLI answers and keeps unapproved facts out of search", async () => {
    const world = await boot();
    await world.session.startRun("ask", `${world.origin}/apply`);
    const answer = await world.session.askUser("What is your full name?", undefined, "Ada Lovelace");
    assert.equal(answer, "Ada Lovelace");
    const proposed = await world.session.proposeKnowledge({
      kind: "user_fact",
      text: "Full name is Ada Lovelace",
      tags: ["name"],
    });
    assert.deepEqual(await world.session.knowledge.search("Ada Lovelace"), []);
    await world.session.knowledge.setStatus(proposed.id, "approved");
    assert.equal(
      (await world.session.knowledge.search("Ada name"))[0]?.sourceRunId,
      world.session.currentRunId,
    );
  });
});

describe("the local extension registers the agent, not a coding agent with a hat", () => {
  it("registers the composed tools and needs no run to look at a page", async () => {
    const { home, cleanup } = await tempHome();
    const server = new FixtureServer();
    const origin = await server.start();
    try {
      process.env.BSA_HOME = home;
      process.env.BSA_HEADLESS = "1";
      const pi = createFakePi();
      browserSessionAgent(pi);
      await pi.startSession();

      // There is no tool swap any more, because there is nothing to swap away from: the
      // agent is a browser agent, and the coding identity is replaced rather than
      // appended to. The swap existed to hide the fact that it was a coding agent.
      const registered = [...pi.tools.keys()];
      for (const name of [TOOL_OBSERVE, TOOL_ACT, TOOL_PEEK, TOOL_SURVEY]) {
        assert.ok(registered.includes(name), `missing ${name} in ${registered.join(",")}`);
      }
      assert.ok(
        !registered.some((name) => name.startsWith("browser_")),
        `the legacy tool set must be gone, saw ${registered.join(",")}`,
      );

      // And the browser starts because the agent wanted a page, not because a run began.
      const observed = await runTool(pi, TOOL_OBSERVE, {});
      assert.equal(Boolean(observed.isError), false, JSON.stringify(observed));

      // Every active tool must be a tool that exists. Starting a run used to select the
      // legacy browser_* names, so after the cutover the model was left holding thirteen
      // tools that had been deleted - and said, correctly, that it could not open a
      // browser. A live agent with no callable tools is the worst kind of broken,
      // because nothing errors.
      const active = pi.getActiveTools();
      assert.ok(active.length > 0, "the agent must have tools");
      for (const name of active) {
        assert.ok(pi.tools.has(name), `active tool ${name} is not registered`);
      }
      assert.equal(active.includes("bash"), false, "and no coding tools, ever");

      await runCommand(pi, "browser-start", `--url ${origin}/apply Apply to the role`);
      const afterStart = pi.getActiveTools();
      for (const name of afterStart) {
        assert.ok(pi.tools.has(name), `starting a run broke ${name}`);
      }
      assert.ok(afterStart.includes(TOOL_OBSERVE), "and left the agent able to look");

      await runCommand(pi, "browser-stop", "--browser");
      assert.ok(
        pi.getActiveTools().includes(TOOL_OBSERVE),
        "stopping a run must not take the agent's tools away either",
      );
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
