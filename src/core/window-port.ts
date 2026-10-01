/**
 * The desktop, as computer-use is allowed to see it.
 *
 * Not a BrowserPort. Refs and CDP stay on the browser. This port lists windows,
 * focuses one, and accepts a click, a string, a key, or a scroll. The harness
 * performs the action (D17). Coordinates are points on the focused window, never refs.
 */

export interface DesktopWindow {
  id: string;
  app: string;
  title: string;
  focused: boolean;
  /** Screen origin of the window, so a click in the image lands on the desktop. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface WindowImage {
  mimeType: "image/png";
  data: string;
}

export type FocusOutcome =
  | { ok: true; window: DesktopWindow }
  | { ok: false; reason: "ambiguous"; titles: string[] };

export interface WindowPort {
  list(): Promise<DesktopWindow[]>;
  capture(windowId: string): Promise<WindowImage>;
  /** Raise a listed window, or launch an app that is not running. */
  focus(title: string): Promise<FocusOutcome>;
  click(windowId: string, x: number, y: number): Promise<void>;
  type(text: string): Promise<void>;
  key(key: string): Promise<void>;
  scroll(dy: number): Promise<void>;
}

/** Chrome is the browser channel. Anything else means the next observe must reattach. */
export function isBrowserApp(app: string): boolean {
  return /^(Google Chrome|Chromium|Chrome)$/i.test(app.trim());
}

export class UnavailableWindowPort implements WindowPort {
  async list(): Promise<DesktopWindow[]> {
    return [];
  }

  async capture(): Promise<WindowImage> {
    throw new Error("computer use is only available on macOS");
  }

  async focus(): Promise<FocusOutcome> {
    throw new Error("computer use is only available on macOS");
  }

  async click(): Promise<void> {
    throw new Error("computer use is only available on macOS");
  }

  async type(): Promise<void> {
    throw new Error("computer use is only available on macOS");
  }

  async key(): Promise<void> {
    throw new Error("computer use is only available on macOS");
  }

  async scroll(): Promise<void> {
    throw new Error("computer use is only available on macOS");
  }
}

/**
 * In-memory desktop. Unit tests drive this. CI never opens a real display.
 */
export class FakeWindowPort implements WindowPort {
  readonly clicks: Array<{ windowId: string; x: number; y: number }> = [];
  readonly typed: string[] = [];
  readonly keys: string[] = [];
  readonly scrolls: number[] = [];
  readonly launched: string[] = [];

  constructor(private windows: DesktopWindow[]) {}

  async list(): Promise<DesktopWindow[]> {
    return this.windows.map((window) => ({ ...window }));
  }

  async capture(windowId: string): Promise<WindowImage> {
    const window = this.windows.find((item) => item.id === windowId);
    if (!window) throw new Error(`no window ${windowId}`);
    return {
      mimeType: "image/png",
      data: Buffer.from(`png:${window.id}`).toString("base64"),
    };
  }

  async focus(title: string): Promise<FocusOutcome> {
    const query = title.trim().toLowerCase();
    const exact = this.windows.filter(
      (window) => window.title.toLowerCase() === query || window.app.toLowerCase() === query,
    );
    const hits =
      exact.length > 0
        ? exact
        : this.windows.filter((window) => `${window.app} ${window.title}`.toLowerCase().includes(query));
    if (hits.length > 1) return { ok: false, reason: "ambiguous", titles: hits.map((window) => window.title) };
    if (hits.length === 1) return { ok: true, window: this.activate(hits[0].id) };
    const id = `launched-${this.launched.length + 1}`;
    this.launched.push(title);
    this.windows.push({ id, app: title, title, focused: false });
    return { ok: true, window: this.activate(id) };
  }

  async click(windowId: string, x: number, y: number): Promise<void> {
    this.clicks.push({ windowId, x, y });
  }

  async type(text: string): Promise<void> {
    this.typed.push(text);
  }

  async key(key: string): Promise<void> {
    this.keys.push(key);
  }

  async scroll(dy: number): Promise<void> {
    this.scrolls.push(dy);
  }

  private activate(id: string): DesktopWindow {
    this.windows = this.windows.map((window) => ({ ...window, focused: window.id === id }));
    const focused = this.windows.find((window) => window.id === id);
    if (!focused) throw new Error(`no window ${id}`);
    return { ...focused };
  }
}
