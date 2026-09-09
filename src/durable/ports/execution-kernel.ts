import type { CompiledAttempt } from "../application/context-compiler.ts";
import type { OperationCheckpoint, OperationOutcome } from "../domain/types.ts";
import type { ObservationLike } from "../../runtime/resource-coordinator.ts";

export interface ExecutionKernel {
  execute(input: CompiledAttempt): Promise<OperationOutcome<unknown>>;
}

/**
 * AGENT-13-T03 — headed rehydration without storing DOM refs.
 * Optional: FakeKernel hosts in tests omit this.
 */
export interface ChallengeSession {
  observe(pageIdentity?: string): Promise<ObservationLike>;
  takeover?(info: { host: string }): Promise<void>;
  /** One parked-intent retry. Must not click a stored ref. */
  redrive?(input: {
    intent: string;
    checkpoint: OperationCheckpoint;
  }): Promise<OperationOutcome<unknown>>;
}

export interface ExecutionHost {
  kernel: ExecutionKernel;
  profileKey: string;
  nowIso: () => string;
  cancel?: AbortSignal;
  headedTakeover?: boolean;
  available: boolean;
  challenge?: ChallengeSession;
}

export class FakeKernel implements ExecutionKernel {
  constructor(private readonly handler: (input: CompiledAttempt) => Promise<OperationOutcome<unknown>>) {}
  execute(input: CompiledAttempt): Promise<OperationOutcome<unknown>> {
    return this.handler(input);
  }
}

/** Direct kernel: delegates to a port-level runner injected by adapters. */
export class DirectKernel implements ExecutionKernel {
  constructor(
    private readonly run: (input: CompiledAttempt, signal?: AbortSignal) => Promise<OperationOutcome<unknown>>,
    private readonly signal?: AbortSignal,
  ) {}

  execute(input: CompiledAttempt): Promise<OperationOutcome<unknown>> {
    return this.run(input, this.signal);
  }
}
