/**
 * What a control is called on the snapshot.
 *
 * Accessible names on real pages are often concatenated twice (a label and an
 * identical aria-label), or tokenized with a digit in the middle of a stutter.
 * The model addresses controls by these names, so the stutter is not identity —
 * it is noise.
 */

function collapseRepeatedHalves(value: string): string {
  let current = value;
  while (current.length >= 2 && current.length % 2 === 0) {
    const mid = current.length / 2;
    const left = current.slice(0, mid);
    if (left !== current.slice(mid)) break;
    current = left;
  }
  return current;
}

function tokenizeName(value: string): string[] {
  const tokens: string[] = [];
  for (const part of value.split(/\s+/)) {
    const bits = part.split(
      /(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=\D)(?=\d)|(?<=\d)(?=[A-Za-z])/,
    );
    tokens.push(...bits.filter(Boolean));
  }
  return tokens;
}

export function collapseAccessibleName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const halved = collapseRepeatedHalves(trimmed);
  const tokens = tokenizeName(halved);
  const out: string[] = [];
  for (const token of tokens) {
    const previous = out[out.length - 1];
    if (previous && previous.toLowerCase() === token.toLowerCase()) continue;
    out.push(token);
  }
  if (
    out.length >= 3 &&
    out[0]!.toLowerCase() === out[out.length - 1]!.toLowerCase()
  ) {
    out.pop();
  }
  return out.join(" ");
}

const GENERIC_NAMES = new Set(["", "a", "link"]);

export function nameFromHref(href: string): string {
  let path = href.split("?")[0]?.split("#")[0] ?? "";
  try {
    path = decodeURIComponent(new URL(href, "https://example.invalid").pathname);
  } catch {
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the raw path
    }
  }
  const parts = path.split("/").filter(Boolean);
  const last = parts.pop() ?? "";
  return last.replace(/\.[a-z0-9]{1,5}$/i, "");
}

export function displayControlName(name: string, href?: string): string {
  const collapsed = collapseAccessibleName(name);
  if (!GENERIC_NAMES.has(collapsed.toLowerCase())) return collapsed;
  if (!href) return collapsed;
  const fromHref = nameFromHref(href);
  return collapseAccessibleName(fromHref) || fromHref || collapsed;
}
