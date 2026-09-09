import type { CompiledAttempt } from "../application/context-compiler.ts";
import type { OperationOutcome } from "../domain/types.ts";

export interface ExecutionKernel {
  execute(input: CompiledAttempt): Promise<OperationOutcome<unknown>>;
}

export interface ExecutionHost {
  kernel: ExecutionKernel;
  profileKey: string;
  nowIso: () => string;
  cancel?: AbortSignal;
  headedTakeover?: boolean;
  available: boolean;
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
