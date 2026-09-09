import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOperatorChoice,
  classifyStrategy,
  dispatchAllowed,
  emptyProgressState,
  evaluateAttempt,
  fingerprintTask,
  isCheckpointFile,
  isRawHarvestFile,
  liveStatusLine,
  MAX_CONSECUTIVE_FAILURES,
  MAX_STAGNANT_ATTEMPTS,
  reconstructProgress,
  standingLastCoderPrompt,
  SUBAGENT_PROGRESS_ENTRY,
} from "../../src/host/pi-subagent/progress.ts";
import { extractTodoItems } from "../../src/host/pi-plan-todos.ts";
import { renderSubagentCall, renderSubagentResult } from "../../src/host/pi-subagent/view.ts";

const MAGPIE_PROMPTS = [
  "Research Product Hunt, AlternativeTo, and other launch directories for Magpi",
  "Find more SaaS newsletters and communities for the launch",
  "Continue harvesting newsletter lists and community pages",
];

describe("semantic work-stream fingerprint", () => {
  it("treats differently worded Magpie harvest prompts as one stream", () => {
    const prints = MAGPIE_PROMPTS.map((task) => fingerprintTask({ task }));
    assert.equal(prints[0]?.strategyFamily, "harvest");
    assert.equal(prints[0]?.deliverable, "launch-research");
    assert.equal(new Set(prints.map((item) => item.workStream)).size, 1);
  });

  it("does not treat prompt rewording or html dumps as progress", () => {
    let state = emptyProgressState();
    for (const [index, task] of MAGPIE_PROMPTS.entries()) {
      const fingerprint = fingerprintTask({
        task,
        listings: [
          { name: `raw-newsletter-${index}.html`, bytes: 4000 + index, mtime: `2026-09-09T10:0${index}:00.000Z` },
        ],
      });
      const decision = evaluateAttempt(state, {
        fingerprint,
        attemptOk: true,
        checkpoint: false,
        elapsedMs: 180_000,
        agent: "coder",
        task,
        artifact: `raw-newsletter-${index}.html`,
        now: `2026-09-09T10:0${index}:00.000Z`,
      });
      state = decision.next;
      if (index < MAX_STAGNANT_ATTEMPTS - 1) {
        assert.equal(decision.halt, undefined);
        assert.equal(decision.semanticProgress, false);
      } else {
        assert.equal(decision.evaluation, "replan");
        assert.equal(decision.halt?.level, "work-stream");
      }
    }
  });

  it("resets the semantic budget only after a recorded compose checkpoint", () => {
    let state = emptyProgressState();
    for (const task of MAGPIE_PROMPTS) {
      const decision = evaluateAttempt(state, {
        fingerprint: fingerprintTask({ task }),
        attemptOk: true,
        checkpoint: false,
        elapsedMs: 10_000,
        agent: "coder",
        task,
        now: "2026-09-09T10:00:00.000Z",
      });
      state = decision.next;
    }
    assert.equal(state.blocked, true);

    const composeTask = "Write the Product Hunt and newsletter pitches into pitches.md";
    const compose = fingerprintTask({
      task: composeTask,
      listings: [{ name: "pitches.md", bytes: 800, mtime: "2026-09-09T10:20:00.000Z" }],
    });
    assert.equal(compose.strategyFamily, "compose");
    assert.notEqual(compose.workStream, state.fingerprint?.workStream);

    state = applyOperatorChoice(state, "Change strategy or tool", "write the pitches into pitches.md");
    const allowed = dispatchAllowed(state, compose);
    assert.equal(allowed.allow, true);

    const harvestAgain = dispatchAllowed(state, fingerprintTask({ task: MAGPIE_PROMPTS[0]! }));
    assert.equal(harvestAgain.allow, false, "reworded harvest cannot reset the budget");

    const done = evaluateAttempt(state, {
      fingerprint: compose,
      attemptOk: true,
      checkpoint: true,
      elapsedMs: 20_000,
      agent: "coder",
      task: composeTask,
    });
    assert.equal(done.semanticProgress, true);
    assert.equal(done.evaluation, "success");
  });

  it("stops after two consecutive failures without a checkpoint", () => {
    let state = emptyProgressState();
    const task = "harvest newsletters for Magpi";
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      const decision = evaluateAttempt(state, {
        fingerprint: fingerprintTask({ task }),
        attemptOk: false,
        checkpoint: false,
        elapsedMs: 180_000,
        agent: "coder",
        task,
      });
      state = decision.next;
      if (i === MAX_CONSECUTIVE_FAILURES - 1) {
        assert.equal(decision.halt?.level, "attempt");
        assert.equal(decision.evaluation, "replan");
      }
    }
    assert.equal(dispatchAllowed(state, fingerprintTask({ task })).allow, false);
  });

  it("reconstructs consecutive failures from session entries", () => {
    const restored = reconstructProgress([
      {
        type: "custom",
        customType: SUBAGENT_PROGRESS_ENTRY,
        data: {
          consecutiveFailures: 2,
          stagnantAttempts: 2,
          blocked: true,
          blockReason: "stuck",
          revisions: [],
          lastCheckpointHashes: [],
        },
      },
    ]);
    assert.equal(restored.consecutiveFailures, 2);
    assert.equal(restored.blocked, true);
  });

  it("ignores raw harvest files as checkpoints", () => {
    assert.equal(isRawHarvestFile("raw-newsletter.html"), true);
    assert.equal(isCheckpointFile("raw-newsletter.html", "launch-research", "harvest"), false);
    assert.equal(isCheckpointFile("pitches.md", "pitches", "compose"), true);
  });

  it("classifies compose vs harvest from the task, not from file count", () => {
    assert.equal(classifyStrategy("curl https://example.com/list"), "harvest");
    assert.equal(classifyStrategy("write pitches.md from the notes"), "compose");
  });
});

describe("plan step labels", () => {
  it("keeps numbered research phases distinct when the heading is bold", () => {
    const items = extractTodoItems(`Plan:
1. **Research** Product Hunt and directories
2. **Research** newsletters and communities
3. **Draft** personalized pitches
`);
    assert.equal(items.length, 3);
    assert.match(items[0]!.text, /Product Hunt/i);
    assert.match(items[1]!.text, /newsletter/i);
    assert.match(items[2]!.text, /pitch/i);
    assert.notEqual(items[0]!.text, items[1]!.text);
  });
});

describe("subagent renderer", () => {
  it("shows the agent and task on the call, not a generic tool line", () => {
    const view = renderSubagentCall({ agent: "coder", task: "harvest newsletters for Magpi" }, undefined);
    const lines = view.render(80);
    assert.match(lines.join("\n"), /subagent/);
    assert.match(lines.join("\n"), /coder/);
    assert.match(lines.join("\n"), /harvest newsletters/);
  });

  it("shows live elapsed tool status on a partial result", () => {
    const view = renderSubagentResult(
      {
        details: {
          agent: "coder",
          running: true,
          elapsedMs: 45_000,
          latestTool: "$ curl https://example.com",
          tools: ["$ curl https://example.com"],
          task: "harvest newsletters",
        },
      },
      { expanded: false, isPartial: true },
      undefined,
    );
    const text = view.render(80).join("\n");
    assert.match(text, /coder running/);
    assert.match(text, /curl/);
  });

  it("includes usage on the live status line", () => {
    assert.match(
      liveStatusLine({
        agent: "coder",
        elapsedMs: 8_000,
        running: true,
        usage: "3 turns ↑12000 ↓800 $0.0123",
      }),
      /\$0\.0123/,
    );
    assert.match(
      standingLastCoderPrompt({
        ...emptyProgressState(),
        lastAgent: "coder",
        lastUsage: "3 turns · $0.0123 · glm-5.3-flash",
        lastArtifact: "site/index.html",
        fingerprint: fingerprintTask({ task: "build the invite site" }),
      }),
      /Last coder · 3 turns/,
    );
  });
});
