/**
 * Grok Bot / Hermes / `magpie -p` never see Magpie TUI dialogs. Coder extend and
 * recovery prompts must not wait for a click that will not happen.
 */

export const BSA_UNATTENDED_ENV = "BSA_UNATTENDED";

export function envIsUnattended(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[BSA_UNATTENDED_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/**
 * True when an operator can answer Magpie confirm/select. Print mode, parent
 * `-p`, and BSA_UNATTENDED=1 are unattended even if Pi still exposes ui.confirm.
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
