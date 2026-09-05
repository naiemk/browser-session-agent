/**
 * Whether a navigation landed where it was aimed.
 *
 * Used by act (navigate postcondition) and peek (did this side tab open the URL we
 * asked for). Kept here so peek does not import the action choke point.
 */
export function urlMatchesIntent(actual: string, target: string): boolean {
  if (!target) return false;
  try {
    const want = new URL(target);
    const got = new URL(actual);
    if (got.host !== want.host) return false;
    const path = want.pathname.replace(/\/$/, "");
    if (!path || path === "") return true;
    return got.pathname.startsWith(path) || actual.includes(path);
  } catch {
    return actual.includes(target);
  }
}
