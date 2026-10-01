/**
 * macOS desktop for `see` / `use`.
 *
 * osascript lists and focuses. screencapture -l grabs one window. CI does not
 * construct this; tests use FakeWindowPort.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  UnavailableWindowPort,
  type DesktopWindow,
  type FocusOutcome,
  type WindowImage,
  type WindowPort,
} from "../core/window-port.ts";

const execFileAsync = promisify(execFile);

const LIST_SWIFT = `
import CoreGraphics
import AppKit
import Foundation
let info = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
let front = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
var rows: [[String: Any]] = []
var marked = false
for w in info {
  let layer = w[kCGWindowLayer as String] as? Int ?? -1
  if layer != 0 { continue }
  let app = w[kCGWindowOwnerName as String] as? String ?? ""
  if app.isEmpty || app == "Window Server" { continue }
  let title = w[kCGWindowName as String] as? String ?? ""
  let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
  let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
  if width < 200 || height < 200 { continue }
  let focused = !marked && app == front
  if focused { marked = true }
  rows.append([
    "id": String(w[kCGWindowNumber as String] as? Int ?? 0),
    "app": app,
    "title": title,
    "focused": focused,
    "x": (bounds["X"] as? NSNumber)?.doubleValue ?? 0,
    "y": (bounds["Y"] as? NSNumber)?.doubleValue ?? 0,
    "width": width,
    "height": height,
  ])
}
let data = try JSONSerialization.data(withJSONObject: rows)
FileHandle.standardOutput.write(data)
`

function run(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return execFileAsync(file, args, {
    timeout: 15000,
    maxBuffer: 12_000_000,
    env: env ? { ...process.env, ...env } : process.env,
  }).then(({ stdout }) => stdout.trim());
}

async function listWindows(): Promise<string> {
  return run("swift", ["-e", LIST_SWIFT]);
}

async function osaArgv(script: string, argv: string[]): Promise<string> {
  return run("osascript", ["-e", script, ...argv]);
}

export class MacWindowPort implements WindowPort {
  async list(): Promise<DesktopWindow[]> {
    const raw = await listWindows();
    const parsed = JSON.parse(raw) as DesktopWindow[];
    return parsed.filter((window) => window.id && window.id !== "0" && window.app);
  }

  async capture(windowId: string): Promise<WindowImage> {
    const dir = await mkdtemp(path.join(tmpdir(), "magpie-see-"));
    const file = path.join(dir, "window.png");
    try {
      await run("screencapture", ["-x", "-o", "-l", windowId, file]);
      const data = (await readFile(file)).toString("base64");
      return { mimeType: "image/png", data };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async focus(title: string): Promise<FocusOutcome> {
    const query = title.trim().toLowerCase();
    const windows = await this.list();
    const exact = windows.filter(
      (window) => window.title.toLowerCase() === query || window.app.toLowerCase() === query,
    );
    const hits =
      exact.length > 0
        ? exact
        : windows.filter((window) => `${window.app} ${window.title}`.toLowerCase().includes(query));
    if (hits.length > 1) return { ok: false, reason: "ambiguous", titles: hits.map((window) => window.title) };
    if (hits.length === 1) {
      await this.raise(hits[0]);
      const again = await this.list();
      return { ok: true, window: again.find((window) => window.id === hits[0].id) ?? { ...hits[0], focused: true } };
    }
    await run("open", ["-a", title]);
    let after = await this.list();
    const opened = () =>
      after.find((window) => window.app.toLowerCase() === query || window.title.toLowerCase() === query);
    for (let attempt = 0; attempt < 8 && !opened(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      after = await this.list();
    }
    const launched = opened();
    if (!launched) throw new Error(`could not open ${title}`);
    return { ok: true, window: launched };
  }

  async click(windowId: string, x: number, y: number): Promise<void> {
    const window = (await this.list()).find((item) => item.id === windowId);
    const left = (window?.x ?? 0) + x;
    const top = (window?.y ?? 0) + y;
    await osaArgv(
      `on run argv
        tell application "System Events" to click at {item 1 of argv as number, item 2 of argv as number}
      end run`,
      [String(left), String(top)],
    );
  }

  async type(text: string): Promise<void> {
    await osaArgv(
      `on run argv
        tell application "System Events" to keystroke (item 1 of argv)
      end run`,
      [text],
    );
  }

  async key(key: string): Promise<void> {
    const code = KEY_CODES[key.toLowerCase()];
    if (code !== undefined) {
      await osaArgv(
        `on run argv
          tell application "System Events" to key code (item 1 of argv as integer)
        end run`,
        [String(code)],
      );
      return;
    }
    await this.type(key);
  }

  async scroll(dy: number): Promise<void> {
    const code = dy >= 0 ? 125 : 126;
    const times = Math.min(8, Math.max(1, Math.ceil(Math.abs(dy) / 40)));
    for (let i = 0; i < times; i++) {
      await osaArgv(
        `on run argv
          tell application "System Events" to key code (item 1 of argv as integer)
        end run`,
        [String(code)],
      );
    }
  }

  private async raise(window: DesktopWindow): Promise<void> {
    await osaArgv(
      `on run argv
        tell application "System Events"
          set frontmost of process (item 1 of argv) to true
          try
            perform action "AXRaise" of (first window of process (item 1 of argv) whose name is item 2 of argv)
          end try
        end tell
      end run`,
      [window.app, window.title],
    );
  }
}

const KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  escape: 53,
  esc: 53,
  tab: 48,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  space: 49,
};

export function localWindowPort(): WindowPort {
  if (process.platform === "darwin") return new MacWindowPort();
  return new UnavailableWindowPort();
}
