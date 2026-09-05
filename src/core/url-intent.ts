/**
 * Whether a navigation landed where it was aimed.
 *
 * Used by act (navigate postcondition) and peek (did this side tab open the URL we
 * asked for). Kept here so peek does not import the action choke point.
 *
 * Paths are compared after decoding and stripping a trailing slash. A last path
 * segment matches its English plural (`reel` / `reels`), so a constructed URL that
 * is off by that one letter is not reported as a miss. Different stems still miss.
 */

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(pathname: string): string {
  const decoded = decodeSegment(pathname);
  if (decoded.length > 1 && decoded.endsWith("/")) return decoded.slice(0, -1);
  return decoded;
}

function segmentsOf(pathname: string): string[] {
  return normalizePath(pathname).split("/").filter(Boolean).map(decodeSegment);
}

/** Equal, or one is the other plus a trailing `s`. */
export function pathSegmentMatches(actual: string, target: string): boolean {
  if (actual === target) return true;
  return actual === `${target}s` || target === `${actual}s`;
}

function pathsMatch(got: string, want: string): boolean {
  if (!want || want === "/") return true;
  if (got === want) return true;
  if (got.startsWith(`${want}/`)) return true;
  const gotSegs = segmentsOf(got);
  const wantSegs = segmentsOf(want);
  if (gotSegs.length !== wantSegs.length) return false;
  return gotSegs.every((segment, index) => pathSegmentMatches(segment, wantSegs[index]!));
}

export function urlMatchesIntent(actual: string, target: string): boolean {
  if (!target) return false;
  try {
    const want = new URL(target);
    const got = new URL(actual);
    if (got.host !== want.host) return false;
    return pathsMatch(normalizePath(got.pathname), normalizePath(want.pathname));
  } catch {
    return actual.includes(target);
  }
}
