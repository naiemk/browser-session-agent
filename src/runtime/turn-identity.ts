/**
 * PERF-01 — pull provider/model off a Pi (or hosted) assistant message.
 *
 * Absent fields stay absent. Guessing `"unknown"` on every unlabeled turn would make
 * a switched-model run look attributed when it is not.
 */

export interface TurnIdentity {
  provider?: string;
  model?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function turnIdentityOf(message: unknown): TurnIdentity {
  const root = asRecord(message);
  if (!root) return {};
  const nestedModel = asRecord(root.model);
  const model = stringField(root.model) ?? stringField(nestedModel?.id) ?? stringField(nestedModel?.model);
  const provider =
    stringField(root.provider) ?? stringField(nestedModel?.provider) ?? stringField(root.providerName);
  const identity: TurnIdentity = {};
  if (provider) identity.provider = provider;
  if (model) identity.model = model;
  return identity;
}

export function turnIdentityKey(identity: TurnIdentity): string {
  return `${identity.provider ?? ""}/${identity.model ?? ""}`;
}

/** Fields to spread onto a turn record. Empty object when the message named nothing. */
export function turnIdentityFields(message: unknown): TurnIdentity {
  return turnIdentityOf(message);
}
