import type { ExtensionAPI } from "../pi-api.ts";

export interface CapabilityConstraint {
  disable?: ReadonlySet<string>;
  enable?: readonly string[];
}

/**
 * One capability owner per Pi extension.
 *
 * Features declare constraints against an immutable parent tool set instead of
 * snapshotting and restoring whatever another feature happened to leave active.
 */
export class CapabilityCoordinator {
  private baseTools: string[] | undefined;
  private readonly constraints = new Map<string, CapabilityConstraint>();

  constructor(private readonly pi: ExtensionAPI) {}

  adoptBaseTools(names: readonly string[]): void {
    this.baseTools = [...new Set(names)];
    this.apply();
  }

  constrain(id: string, constraint: CapabilityConstraint): void {
    this.ensureBaseTools();
    this.constraints.set(id, constraint);
    this.apply();
  }

  release(id: string): void {
    if (!this.constraints.delete(id)) return;
    this.apply();
  }

  private ensureBaseTools(): void {
    if (this.baseTools === undefined) this.baseTools = [...new Set(this.pi.getActiveTools())];
  }

  private apply(): void {
    this.ensureBaseTools();
    const disabled = new Set<string>();
    const enabled: string[] = [];
    for (const constraint of this.constraints.values()) {
      for (const name of constraint.disable ?? []) disabled.add(name);
      for (const name of constraint.enable ?? []) enabled.push(name);
    }
    const next = [...this.baseTools!, ...enabled].filter((name) => !disabled.has(name));
    this.pi.setActiveTools([...new Set(next)]);
  }
}

const coordinators = new WeakMap<ExtensionAPI, CapabilityCoordinator>();

export function capabilityCoordinator(pi: ExtensionAPI): CapabilityCoordinator {
  const existing = coordinators.get(pi);
  if (existing) return existing;
  const created = new CapabilityCoordinator(pi);
  coordinators.set(pi, created);
  return created;
}
