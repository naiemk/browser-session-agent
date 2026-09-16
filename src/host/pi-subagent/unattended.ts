/**
 * Operator presence for Magpie TUI waits.
 *
 * Print mode / Grok Bot / BSA_UNATTENDED still expose ui.confirm, select, input,
 * and editor. Awaiting those methods hangs forever. Gate every Magpie await of
 * those APIs on operatorCanConfirm — not on "the function exists."
 *
 * Fail closed: menus skip; questions return no answer; irreversible approves are
 * false. Never auto-yes send/pay/delete.
 */

export const BSA_UNATTENDED_ENV = "BSA_UNATTENDED";

export function envIsUnattended(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[BSA_UNATTENDED_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * True when an operator can answer Magpie confirm/select/input/editor.
 * BSA_UNATTENDED=1 and hasUI === false are unattended even if ui.confirm exists.
 */
export function operatorCanConfirm(
  ctx?: { hasUI?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (envIsUnattended(env)) return false;
  if (ctx?.hasUI === false) return false;
  return true;
}

export function argvLooksUnattended(args: readonly string[]): boolean {
  return args.some((arg) => arg === "-p" || arg === "--print");
}

/** Magpie CLI sets BSA_UNATTENDED so the extension sees print/parent mode. */
export function shouldMarkUnattended(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  io: { stdinTty?: boolean } = {},
): boolean {
  if (envIsUnattended(env)) return true;
  if (argvLooksUnattended(args)) return true;
  if (io.stdinTty === false) return true;
  return false;
}
