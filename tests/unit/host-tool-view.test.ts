import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fitLine, renderToolResult, wrapToWidth } from "../../src/host/pi-tool-view.ts";
import { TOOL_ACT, TOOL_OBSERVE } from "../../src/runtime/names.ts";

function everyLineFits(lines: string[], width: number): void {
  for (const [index, line] of lines.entries()) {
    assert.ok(
      line.length <= width,
      `line ${index} is ${line.length} wide, terminal is ${width}: ${JSON.stringify(line)}`,
    );
  }
}

describe("fitting a tool result to the terminal", () => {
  it("never emits a line wider than the pane, which is what crashed Pi", () => {
    // The crash: `Rendered line 91 exceeds terminal width (111 > 45)`. The collapsed
    // view ignored width and printed a 110-character summary into a 45-column pane.
    const details = {
      url: "https://www.instagram.com/explore/",
      title: "Explore",
      controls: Array.from({ length: 40 }, (_, index) => ({
        ref: `e${index}`,
        role: "link",
        name: "SearchSearch",
      })),
      changes: ["clicked Search"],
    };
    const result = {
      content: [{ type: "text", text: JSON.stringify(details) }],
      details,
    };

    const collapsed = renderToolResult(result, { expanded: false, isPartial: false }, TOOL_ACT);
    const lines = collapsed.render(45);
    assert.equal(lines.length, 1);
    everyLineFits(lines, 45);
  });

  it("wraps an expanded payload to the pane rather than assuming 20 columns of slack", () => {
    const text = "x".repeat(200);
    const result = { content: [{ type: "text", text }], details: {} };
    const expanded = renderToolResult(result, { expanded: true, isPartial: false }, TOOL_OBSERVE);

    const atTen = expanded.render(10);
    everyLineFits(atTen, 10);
    assert.equal(atTen.join(""), text);

    const atFortyFive = expanded.render(45);
    everyLineFits(atFortyFive, 45);
    assert.equal(atFortyFive.join(""), text);
  });

  it("fits a footer that would itself overflow a narrow pane", () => {
    const text = `${"row\n".repeat(250)}tail`;
    const result = { content: [{ type: "text", text }], details: {} };
    const lines = renderToolResult(result, { expanded: true, isPartial: false }, TOOL_OBSERVE).render(20);
    everyLineFits(lines, 20);
    assert.match(lines.at(-1) ?? "", /more lines/);
  });
});

describe("wrapping and clipping", () => {
  it("clips a long line and keeps a short one whole", () => {
    assert.equal(fitLine("ok", 45), "ok");
    assert.equal(fitLine("x".repeat(110), 45).length, 45);
    assert.equal(fitLine("x".repeat(110), 45).endsWith("…"), true);
  });

  it("does not invent a 20-column minimum, which overflowed a narrower pane", () => {
    const lines = wrapToWidth("abcdefghijklmnopqrstuvwxyz", 10);
    everyLineFits(lines, 10);
    assert.deepEqual(lines, ["abcdefghij", "klmnopqrst", "uvwxyz"]);
  });
});
