/**
 * AGENT-14 — effect identity for intent-bound envelopes (host-neutral).
 * Durable adapters match grants on these fields; DOM refs are forbidden.
 */

export interface EffectIdentity {
  effect: string;
  host?: string;
  destination?: string;
  formAction?: string;
  stage?: string;
  amount?: string;
  audience?: string;
  entityKey?: string;
  controlKind?: string;
  controlName?: string;
}

export function effectIdentityKey(id: EffectIdentity): string {
  return [
    id.effect,
    id.host ?? "*",
    id.destination ?? "*",
    id.formAction ?? "*",
    id.stage ?? "*",
    id.amount ?? "*",
    id.audience ?? "*",
    id.entityKey ?? "*",
    id.controlKind ?? "*",
    id.controlName ? id.controlName.trim().toLowerCase() : "*",
  ].join("|");
}

export function identitiesCompatible(granted: EffectIdentity, actual: EffectIdentity): boolean {
  const fields: (keyof EffectIdentity)[] = [
    "effect",
    "host",
    "destination",
    "formAction",
    "stage",
    "amount",
    "audience",
    "entityKey",
    "controlKind",
  ];
  for (const field of fields) {
    const g = granted[field];
    const a = actual[field];
    if (g && a && g !== a) return false;
  }
  if (granted.controlName && actual.controlName) {
    if (granted.controlName.trim().toLowerCase() !== actual.controlName.trim().toLowerCase()) {
      return false;
    }
  }
  return granted.effect === actual.effect;
}
